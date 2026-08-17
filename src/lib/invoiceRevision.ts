/**
 * Invoice revision.
 *
 * A frozen invoice keeps a full input snapshot (see `invoiceSnapshot.ts`).
 * Within the 30-day revision window an operator can correct the invoice
 * without deleting it: the original stays in history marked as superseded and
 * a new invoice is created with `revised_from_invoice_id` pointing at it.
 *
 * The default (and safest) correction mode only touches assets that were
 * 0 MW in the snapshot and now report a real capacity — everything else stays
 * exactly as frozen. Assets that appeared after the invoice was cut are
 * excluded by default so a correction never sneaks in newly onboarded sites.
 */

import { supabase } from '@/integrations/supabase/client';
import {
  calculateInvoice,
  getFrequencyMultiplier,
  getPeriodMonthsMultiplier,
  type CalculationParams,
  type CalculationResult,
  type OrgAssetGroup,
} from '@/lib/invoiceCalculations';
import { SPS_ADDONS, isSpsPackage, isSolarAfricaPackage } from '@/data/pricingData';
import { monthsInPeriod, isAnnualUpfrontCycle } from '@/lib/invoiceScheduling';
import type { InvoiceInputSnapshot } from '@/lib/invoiceSnapshot';

export type RevisionMode = 'zero_mw_only' | 'full_recalc';

export interface LiveAsset {
  assetId: string;
  assetName: string;
  totalMW: number;
  [key: string]: any;
}

export interface ZeroMwCorrection {
  assetId: string;
  assetName: string;
  previousMW: number; // always 0 for this class
  newMW: number;
}

export interface SnapshotDiff {
  /** Assets frozen at 0 MW that now report a real capacity. */
  corrections: ZeroMwCorrection[];
  /** Assets present in live data but absent from the snapshot. */
  newlyOnboarded: LiveAsset[];
  /** Assets in the snapshot that no longer exist in live data. */
  removed: Array<{ assetId: string; assetName: string; totalMW: number }>;
  /** Assets whose MW changed but were not zero before. */
  changed: Array<{ assetId: string; assetName: string; previousMW: number; newMW: number }>;
  unchangedCount: number;
  snapshotTotalMW: number;
  liveTotalMW: number;
}

const num = (v: any) => Number(v) || 0;

/**
 * Classify every live asset against the frozen snapshot.
 */
export function diffSnapshotAgainstLive(
  snapshot: InvoiceInputSnapshot,
  liveAssets: LiveAsset[],
): SnapshotDiff {
  const snapAssets = Array.isArray(snapshot?.assets) ? snapshot.assets : [];
  const snapById = new Map(snapAssets.map((a) => [String(a.assetId), a]));
  const liveById = new Map((liveAssets || []).map((a) => [String(a.assetId), a]));

  const corrections: ZeroMwCorrection[] = [];
  const changed: SnapshotDiff['changed'] = [];
  const newlyOnboarded: LiveAsset[] = [];
  let unchangedCount = 0;

  for (const live of liveAssets || []) {
    const id = String(live.assetId);
    const snap = snapById.get(id);
    if (!snap) {
      newlyOnboarded.push(live);
      continue;
    }
    const before = num(snap.totalMW);
    const after = num(live.totalMW);
    if (before === after) {
      unchangedCount++;
    } else if (before === 0 && after > 0) {
      corrections.push({
        assetId: id,
        assetName: live.assetName || snap.assetName || id,
        previousMW: 0,
        newMW: after,
      });
    } else {
      changed.push({
        assetId: id,
        assetName: live.assetName || snap.assetName || id,
        previousMW: before,
        newMW: after,
      });
    }
  }

  const removed = snapAssets
    .filter((a) => !liveById.has(String(a.assetId)))
    .map((a) => ({ assetId: String(a.assetId), assetName: a.assetName, totalMW: num(a.totalMW) }));

  return {
    corrections,
    newlyOnboarded,
    removed,
    changed,
    unchangedCount,
    snapshotTotalMW: snapAssets.reduce((s, a) => s + num(a.totalMW), 0),
    liveTotalMW: (liveAssets || []).reduce((s, a) => s + num(a.totalMW), 0),
  };
}

export interface CorrectionSelection {
  mode: RevisionMode;
  /** Asset ids from `diff.corrections` the operator ticked. */
  selectedAssetIds: string[];
  /** When false (default) assets absent from the snapshot are left out. */
  includeNewlyOnboarded: boolean;
}

/**
 * Produce the asset list the revision should be calculated on.
 *
 * - `zero_mw_only`: snapshot assets, with the ticked zero-MW assets lifted to
 *   their live capacity. Nothing else moves.
 * - `full_recalc`: live assets (optionally minus the newly onboarded ones).
 *
 * Live asset metadata (devices, solcast, genset kVA…) is preferred wherever a
 * live row exists so the recalculation uses current site attributes.
 */
export function applySelectedCorrections(
  snapshot: InvoiceInputSnapshot,
  liveAssets: LiveAsset[],
  selection: CorrectionSelection,
): LiveAsset[] {
  const liveById = new Map((liveAssets || []).map((a) => [String(a.assetId), a]));
  const snapAssets = Array.isArray(snapshot?.assets) ? snapshot.assets : [];
  const snapIds = new Set(snapAssets.map((a) => String(a.assetId)));
  const picked = new Set(selection.selectedAssetIds.map(String));

  if (selection.mode === 'full_recalc') {
    const base = selection.includeNewlyOnboarded
      ? liveAssets || []
      : (liveAssets || []).filter((a) => snapIds.has(String(a.assetId)));
    return base.map((a) => ({ ...a, totalMW: num(a.totalMW) }));
  }

  const result: LiveAsset[] = snapAssets.map((snap) => {
    const id = String(snap.assetId);
    const live = liveById.get(id);
    const useLiveMW = live && picked.has(id) && num(snap.totalMW) === 0 && num(live.totalMW) > 0;
    return {
      ...(live || {}),
      assetId: id,
      assetName: live?.assetName || snap.assetName,
      totalMW: useLiveMW ? num(live!.totalMW) : num(snap.totalMW),
    };
  });

  if (selection.includeNewlyOnboarded) {
    for (const live of liveAssets || []) {
      if (!snapIds.has(String(live.assetId))) {
        result.push({ ...live, totalMW: num(live.totalMW) });
      }
    }
  }

  return result;
}

/**
 * Rebuild the Elum org breakdown so per-org MW reflects the patched assets.
 * Orgs are taken from live capabilities (structure/tiers) but each asset's MW
 * and membership come from the patched list.
 */
export function patchOrgBreakdown(
  liveOrgBreakdown: OrgAssetGroup[] | undefined,
  patchedAssets: LiveAsset[],
): OrgAssetGroup[] | undefined {
  if (!Array.isArray(liveOrgBreakdown) || liveOrgBreakdown.length === 0) return undefined;
  const byId = new Map(patchedAssets.map((a) => [String(a.assetId), a]));
  return liveOrgBreakdown.map((org) => ({
    ...org,
    assets: (org.assets || [])
      .filter((a) => byId.has(String(a.assetId)))
      .map((a) => ({ ...a, totalMW: num(byId.get(String(a.assetId))!.totalMW) })),
  }));
}

/**
 * Rebuild an org breakdown purely from the frozen snapshot. Only possible when
 * the snapshot stored per-org asset membership (`assetIds`).
 */
export function orgBreakdownFromSnapshot(
  orgs: Array<Record<string, any>> | undefined,
  assets: LiveAsset[],
): OrgAssetGroup[] | undefined {
  if (!Array.isArray(orgs) || orgs.length === 0) return undefined;
  if (!orgs.some((o) => Array.isArray(o?.assetIds) && o.assetIds.length > 0)) return undefined;
  const byId = new Map(assets.map((a) => [String(a.assetId), a]));
  return orgs.map((o, idx) => ({
    orgId: String(o.orgId ?? `snap-${idx}`),
    orgName: o.orgName || 'Unknown organisation',
    tier: o.tier ?? null,
    hasEconf: !!o.econf,
    isLegacyAssetGroup: !!o.isLegacyAssetGroup,
    assets: (o.assetIds || [])
      .map((id: string) => byId.get(String(id)))
      .filter(Boolean)
      .map((a: LiveAsset) => ({
        assetId: String(a.assetId),
        assetName: a.assetName,
        totalMW: num(a.totalMW),
      })),
  }));
}

/**
 * Choose the org breakdown to price on. Live data is preferred, but when it is
 * missing or covers fewer organisations than the snapshot (the org resolution
 * changed since the invoice was frozen) the snapshot's own structure wins so
 * the frozen total stays reproducible.
 */
export function resolveOrgBreakdown(
  liveOrgBreakdown: OrgAssetGroup[] | undefined,
  snapshotOrgs: Array<Record<string, any>> | undefined,
  patchedAssets: LiveAsset[],
): OrgAssetGroup[] | undefined {
  const fromSnapshot = orgBreakdownFromSnapshot(snapshotOrgs, patchedAssets);
  const fromLive = patchOrgBreakdown(liveOrgBreakdown, patchedAssets);
  if (!fromSnapshot) return fromLive;
  if (!fromLive) return fromSnapshot;
  return fromLive.length >= fromSnapshot.length ? fromLive : fromSnapshot;
}


/**
 * Build `CalculationParams` from a stored contract row (as captured in the
 * snapshot) plus a resolved asset list. Mirrors the mapping the invoice
 * calculator does from live contract state.
 */
export function buildParamsFromContractRow(
  contract: Record<string, any>,
  opts: {
    assets: LiveAsset[];
    orgBreakdown?: OrgAssetGroup[];
    invoiceDate: Date;
    periodStart?: string | null;
    periodEnd?: string | null;
    billingFrequency: string;
    contractType?: { modules_config?: any[]; addons_config?: any[] } | null;
    ytdInvoicedAmount?: number;
  },
): CalculationParams {
  const c = contract || {};
  const packageType =
    (c.contract_types?.pricing_model === 'per_mw_annual_upfront'
      ? 'per_mw_annual_upfront'
      : c.package) || 'starter';

  const totalMW = opts.assets.reduce((s, a) => s + num(a.totalMW), 0);

  let frequencyMultiplier = getFrequencyMultiplier(opts.billingFrequency);
  const actualMonths = monthsInPeriod(opts.periodStart as any, opts.periodEnd as any);
  const defaultMonths = getPeriodMonthsMultiplier(opts.billingFrequency);
  if (actualMonths && actualMonths < defaultMonths) {
    frequencyMultiplier = actualMonths / 12;
  }

  const orgPricingConfig = c.org_pricing_config || {};
  const addons = Array.isArray(c.addons) ? c.addons : [];

  return {
    packageType,
    totalMW,
    selectedModules: Array.isArray(c.modules) ? (c.modules as string[]) : [],
    selectedAddons: addons.map((a: any) => ({
      id: a.id,
      complexity: a.complexity,
      customPrice: a.customPrice,
      quantity: a.quantity,
      customTiers: a.customTiers,
    })),
    customPricing: c.custom_pricing || {},
    minimumAnnualValue: num(c.minimum_annual_value),
    minimumCharge: num(c.minimum_charge),
    minimumChargeTiers: Array.isArray(c.minimum_charge_tiers) ? c.minimum_charge_tiers : [],
    portfolioDiscountTiers: Array.isArray(c.portfolio_discount_tiers) ? c.portfolio_discount_tiers : [],
    frequencyMultiplier,
    billingFrequency: opts.billingFrequency,
    ammpCapabilities: c.cached_capabilities || undefined,
    assetBreakdown: opts.assets.map((a) => ({
      assetId: a.assetId,
      assetName: a.assetName,
      totalMW: num(a.totalMW),
      capacityKWp: a.capacityKWp,
      gensetKVA: a.gensetKVA,
      isHybrid: a.isHybrid,
      hasSolcast: a.hasSolcast,
      solcastOnboardingDate: a.solcastOnboardingDate,
      onboardingDate: a.onboardingDate,
      deviceCount: a.deviceCount,
      devices: a.devices,
    })),
    enableSiteMinimumPricing: opts.assets.length > 0,
    baseMonthlyPrice: num(c.base_monthly_price),
    siteChargeFrequency: (c.site_charge_frequency as 'monthly' | 'annual') || 'annual',
    retainerHours: num(c.retainer_hours),
    retainerHourlyRate: num(c.retainer_hourly_rate),
    retainerMinimumValue: num(c.retainer_minimum_value),
    onboardingFeePerSite: num(c.onboarding_fee_per_site) || 1000,
    annualFeePerSite: num(c.annual_fee_per_site) || 1000,
    siteSizeThresholdKwp: num(c.site_size_threshold_kwp) || 100,
    belowThresholdPricePerMWp: num(c.below_threshold_price_per_mwp) || 50,
    aboveThresholdPricePerMWp: num(c.above_threshold_price_per_mwp) || 30,
    graduatedMWTiers: Array.isArray(c.graduated_mw_tiers) ? c.graduated_mw_tiers : undefined,
    jubailiKvaBands: orgPricingConfig.jubailiKvaBands,
    orgBreakdown: opts.orgBreakdown,
    elumLiteBaseRate: orgPricingConfig.liteBaseRate,
    elumLiteEconfRate: orgPricingConfig.liteEconfRate,
    elumInternalBrackets: orgPricingConfig.internalBrackets,
    elumInternalEconfRate: orgPricingConfig.internalEconfRate,
    customAssetPricing: c.custom_asset_pricing || undefined,
    isTrial: !!c.is_trial,
    trialSetupFee: num(c.trial_setup_fee) || undefined,
    vendorApiOnboardingFee: num(c.vendor_api_onboarding_fee) || undefined,
    municipalityCount: num(c.municipality_count) || undefined,
    apiSetupFee: num(c.api_setup_fee) || undefined,
    hourlyRate: num(c.hourly_rate) || undefined,
    includeSetupFee: isSolarAfricaPackage(packageType) ? false : undefined,
    invoiceDate: opts.invoiceDate,
    periodStart: (opts.periodStart as string) || undefined,
    periodEnd: (opts.periodEnd as string) || undefined,
    customModuleDefinitions: opts.contractType?.modules_config?.length
      ? opts.contractType.modules_config
      : undefined,
    customAddonDefinitions: isSpsPackage(packageType)
      ? SPS_ADDONS
      : opts.contractType?.addons_config?.length
        ? opts.contractType.addons_config
        : undefined,
    upfrontDiscountPercent:
      c.upfront_discount_percent != null ? Number(c.upfront_discount_percent) : undefined,
    commitmentDiscountPercent:
      c.commitment_discount_percent != null ? Number(c.commitment_discount_percent) : undefined,
    irradiancePerSiteTiers: Array.isArray(c.irradiance_per_site_tiers)
      ? c.irradiance_per_site_tiers
      : undefined,
    performancePerMwpTiers: Array.isArray(c.performance_per_mwp_tiers)
      ? c.performance_per_mwp_tiers
      : undefined,
    annualMinimumFee: c.annual_minimum_fee != null ? Number(c.annual_minimum_fee) : undefined,
    committedMinimumMW: c.committed_minimum_mw != null ? Number(c.committed_minimum_mw) : undefined,
    annualBillingAnchorDate: c.annual_billing_anchor_date || undefined,
    ytdInvoicedAmount: opts.ytdInvoicedAmount ?? num(c.ytd_invoiced_amount),
    perMWAnnualUpfrontIsAnnualCycle:
      packageType === 'per_mw_annual_upfront'
        ? isAnnualUpfrontCycle(opts.invoiceDate, c.annual_billing_anchor_date)
        : undefined,
    spsIsAnnualCycle:
      packageType === 'sps_monitoring' && c.annual_billing_anchor_date
        ? isAnnualUpfrontCycle(opts.invoiceDate, c.annual_billing_anchor_date)
        : undefined,
  };
}

export interface RevisionComputation {
  params: CalculationParams;
  result: CalculationResult;
  totalMW: number;
}

export function computeRevision(
  snapshot: InvoiceInputSnapshot,
  liveAssets: LiveAsset[],
  liveOrgBreakdown: OrgAssetGroup[] | undefined,
  selection: CorrectionSelection,
  opts: {
    invoiceDate: Date;
    billingFrequency: string;
    contractType?: { modules_config?: any[]; addons_config?: any[] } | null;
  },
): RevisionComputation {
  const assets = applySelectedCorrections(snapshot, liveAssets, selection);
  const orgBreakdown = patchOrgBreakdown(liveOrgBreakdown, assets);
  const params = buildParamsFromContractRow(snapshot.contract as Record<string, any>, {
    assets,
    orgBreakdown,
    invoiceDate: opts.invoiceDate,
    periodStart: snapshot.periodStart,
    periodEnd: snapshot.periodEnd,
    billingFrequency: opts.billingFrequency,
    contractType: opts.contractType,
  });
  const result = calculateInvoice(params);
  return { params, result, totalMW: params.totalMW };
}

/**
 * Sanity check: recompute the invoice from the untouched snapshot and compare
 * with the frozen total. When they disagree, the reconstruction of the frozen
 * inputs is not faithful and the operator should be warned before revising.
 */
export function verifySnapshotReproduces(
  snapshot: InvoiceInputSnapshot,
  opts: { invoiceDate: Date; billingFrequency: string; contractType?: any },
): { ok: boolean; recomputed: number; frozen: number } {
  const frozen = num(snapshot?.totals?.invoiceAmount);
  try {
    const { result } = computeRevision(
      snapshot,
      (snapshot.assets || []) as LiveAsset[],
      undefined,
      { mode: 'zero_mw_only', selectedAssetIds: [], includeNewlyOnboarded: false },
      opts,
    );
    const recomputed = num(result.totalPrice);
    return { ok: Math.abs(recomputed - frozen) < 0.51, recomputed, frozen };
  } catch {
    return { ok: false, recomputed: NaN, frozen };
  }
}

/** Fetch the current (live) asset breakdown + org breakdown for a contract. */
export async function fetchLiveContractData(contractId: string): Promise<{
  assets: LiveAsset[];
  orgBreakdown?: OrgAssetGroup[];
  contract: any;
  contractType: any;
}> {
  const { data } = await supabase
    .from('contracts')
    .select('*, contract_types(pricing_model, modules_config, addons_config)')
    .eq('id', contractId)
    .maybeSingle();

  const caps: any = (data as any)?.cached_capabilities || {};
  const rawAssets: any[] = caps.assetBreakdown || caps.assets || [];
  return {
    assets: rawAssets.map((a: any) => ({ ...a, assetId: String(a.assetId ?? a.id), totalMW: num(a.totalMW) })),
    orgBreakdown: Array.isArray(caps.orgBreakdown) ? caps.orgBreakdown : undefined,
    contract: data,
    contractType: (data as any)?.contract_types || null,
  };
}

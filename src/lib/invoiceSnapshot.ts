/**
 * Invoice input snapshots.
 *
 * Every new invoice writes a full snapshot of the inputs used to compute it
 * (resolved asset list, per-asset MW/capabilities, contract rates at
 * generation time, exchange rate, zero-PV substitutions, period bounds). We
 * store `snapshot_frozen_at` and a 30-day `revision_deadline` so an operator
 * can redo an invoice deterministically if source data (typically zero-PV
 * assets) gets corrected within that window.
 */

export const REVISION_WINDOW_DAYS = 30;

export interface SnapshotAsset {
  assetId: string;
  assetName: string;
  totalMW: number;
  /** Genset rating in kVA at freeze time (Jubaili banded pricing). */
  gensetKVA?: number | null;
  isEstimated?: boolean;
  estimatedFromMW?: number;
  estimateSource?: string;
  incidentId?: string;
}

export interface SnapshotOrgRow {
  orgId?: string;
  orgName: string;
  tier?: string;
  econf?: boolean;
  siteCount?: number;
  totalMW?: number;
  ratePerMWp?: number;
  cost?: number;
  isLegacyAssetGroup?: boolean;
  /** Asset ids belonging to this organisation — required to rebuild pricing. */
  assetIds?: string[];
}

/**
 * One contract inside a merged invoice. Merged invoices are priced per
 * contract and summed, so a faithful snapshot has to keep each contract's own
 * rates, assets, organisations and period.
 */
export interface SnapshotContractEntry {
  contractId: string;
  contractName?: string;
  billingFrequency?: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  subtotal?: number;
  contract: Record<string, unknown>;
  assets: SnapshotAsset[];
  orgs?: SnapshotOrgRow[];
}

export interface SnapshotLineItem {
  description?: string;
  quantity?: number;
  unitAmount?: number;
  lineAmount?: number;
  accountCode?: string;
  [key: string]: unknown;
}


export interface InvoiceInputSnapshot {
  version: 1;
  contractId: string;
  customerId: string;
  invoiceDate: string; // ISO
  periodStart?: string | null;
  periodEnd?: string | null;
  currency: string;
  exchangeRateEUR?: number | null;

  // Contract rate configuration at freeze time — full JSON blob.
  contract: Record<string, unknown>;

  // Resolved asset list at freeze time (from cached_capabilities.assets
  // after zero-PV substitutions).
  assets: SnapshotAsset[];

  // Per-organisation tier/rate rows for Elum 2026 org-tier contracts.
  orgs?: SnapshotOrgRow[];

  // For merged invoices: the per-contract inputs, each priced on its own.
  // Absent on single-contract invoices and on merged invoices frozen before
  // per-contract snapshots existed (those cannot be recomputed).
  contracts?: SnapshotContractEntry[];


  // The Xero line items actually sent for this invoice.
  lineItems?: SnapshotLineItem[];

  // Zero-PV incidents referenced by this invoice (for reversal on delete
  // or revision).
  zeroPvIncidentIds: string[];

  // The final line items / totals actually stored on the invoice — kept for
  // audit and diff on revision.
  totals: {
    invoiceAmount: number;
    arrAmount?: number;
    nrrAmount?: number;
    totalMW?: number;
    siteCount?: number;
  };
}

export interface SnapshotFields {
  input_snapshot: InvoiceInputSnapshot;
  snapshot_frozen_at: string;
  revision_deadline: string;
}


export function buildSnapshot(snap: InvoiceInputSnapshot): SnapshotFields {
  const now = new Date();
  const deadline = new Date(now.getTime() + REVISION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return {
    input_snapshot: snap,
    snapshot_frozen_at: now.toISOString(),
    revision_deadline: deadline.toISOString(),
  };
}

/** Normalise a raw cached-capabilities asset list into snapshot assets. */
export function toSnapshotAssets(rawAssets: any[] | undefined | null): SnapshotAsset[] {
  return (rawAssets || []).map((a: any) => ({
    assetId: String(a.assetId ?? a.id ?? a.asset_id ?? ''),
    assetName: a.assetName ?? a.name ?? 'Unknown',
    totalMW: Number(a.totalMW ?? a.capacityMW ?? 0) || 0,
    gensetKVA: a.gensetKVA != null ? Number(a.gensetKVA) : a.genset_capacity != null ? Number(a.genset_capacity) / 1000 : undefined,
    isEstimated: a.isEstimated ?? undefined,
    estimatedFromMW: a.estimatedFromMW ?? undefined,
    estimateSource: a.estimateSource ?? undefined,
    incidentId: a.incidentId ?? undefined,
  }));
}

/** Normalise a raw cached-capabilities org breakdown into snapshot org rows. */
export function toSnapshotOrgs(rawOrgs: any[] | undefined | null): SnapshotOrgRow[] | undefined {
  if (!Array.isArray(rawOrgs)) return undefined;
  return rawOrgs.map((o: any) => ({
    orgId: o.orgId ?? o.id,
    orgName: o.orgName ?? o.name ?? 'Unknown organisation',
    tier: o.tier,
    econf: o.econf ?? o.hasEconf,
    siteCount: o.siteCount ?? o.assetCount ?? (Array.isArray(o.assets) ? o.assets.length : undefined),
    totalMW: o.totalMW,
    ratePerMWp: o.ratePerMWp ?? o.pricePerMWp,
    cost: o.cost,
    isLegacyAssetGroup: o.isLegacyAssetGroup ?? undefined,
    assetIds: Array.isArray(o.assets)
      ? o.assets.map((a: any) => String(a.assetId ?? a.id ?? '')).filter(Boolean)
      : undefined,
  }));
}

export interface SnapshotContractInput {
  contractId: string;
  contractName?: string;
  billingFrequency?: string;
  periodStart?: Date | string | null;
  periodEnd?: Date | string | null;
  subtotal?: number;
  /** Full contract row as stored in the database. */
  contract: Record<string, unknown>;
  /** That contract's cached_capabilities at freeze time. */
  capabilities?: any;
}

/**
 * Builds the DB fields for a frozen invoice from the loose objects available
 * at invoice-creation time. Returns `null` when freezing is disabled for the
 * contract, so callers can spread the result unconditionally.
 */
export function buildSnapshotFields(params: {
  freezeEnabled: boolean;
  contractId: string;
  customerId: string;
  invoiceDate: Date | string;
  periodStart?: Date | string | null;
  periodEnd?: Date | string | null;
  currency: string;
  exchangeRateEUR?: number | null;
  contract?: Record<string, unknown> | null;
  capabilities?: any;
  /** Per-contract inputs for merged invoices. */
  contracts?: SnapshotContractInput[];
  lineItems?: SnapshotLineItem[];
  totals: InvoiceInputSnapshot['totals'];
}): SnapshotFields | null {
  if (!params.freezeEnabled) return null;

  const iso = (d: Date | string | null | undefined) =>
    d == null ? null : (typeof d === 'string' ? d : d.toISOString());

  const caps = params.capabilities || {};
  const rawAssets: any[] = caps.assets || caps.assetBreakdown || [];
  const assets: SnapshotAsset[] = toSnapshotAssets(rawAssets);
  const orgs = toSnapshotOrgs(caps.orgBreakdown);

  const contracts: SnapshotContractEntry[] | undefined = params.contracts?.map((entry) => {
    const entryCaps = entry.capabilities || {};
    return {
      contractId: entry.contractId,
      contractName: entry.contractName,
      billingFrequency: entry.billingFrequency,
      periodStart: iso(entry.periodStart),
      periodEnd: iso(entry.periodEnd),
      subtotal: entry.subtotal,
      contract: entry.contract || {},
      assets: toSnapshotAssets(entryCaps.assets || entryCaps.assetBreakdown),
      orgs: toSnapshotOrgs(entryCaps.orgBreakdown),
    };
  });

  const snapshot: InvoiceInputSnapshot = {
    version: 1,
    contractId: params.contractId,
    customerId: params.customerId,
    invoiceDate: iso(params.invoiceDate) as string,
    periodStart: iso(params.periodStart),
    periodEnd: iso(params.periodEnd),
    currency: params.currency,
    exchangeRateEUR: params.exchangeRateEUR ?? null,
    contract: (params.contract as Record<string, unknown>) || {},
    assets,
    orgs,
    ...(contracts?.length ? { contracts } : {}),
    lineItems: params.lineItems,
    zeroPvIncidentIds: rawAssets
      .map((a: any) => a?.incidentId)
      .filter((id: any): id is string => typeof id === 'string'),
    totals: {
      ...params.totals,
      siteCount: params.totals.siteCount ?? assets.length,
    },
  };



  return buildSnapshot(snapshot);
}


export function isWithinRevisionWindow(
  revisionDeadline: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!revisionDeadline) return false;
  return new Date(revisionDeadline).getTime() > now.getTime();
}

export function daysUntilRevisionDeadline(
  revisionDeadline: string | null | undefined,
  now: Date = new Date()
): number | null {
  if (!revisionDeadline) return null;
  const ms = new Date(revisionDeadline).getTime() - now.getTime();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

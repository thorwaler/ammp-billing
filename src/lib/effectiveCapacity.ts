/**
 * Effective billed capacity per asset (Elum 2026 packages).
 *
 * Some Elum sites have no PV at all, or carry a registered PV capacity that the
 * capacity sanity check proved implausible. For those, AMMP's
 * `asset_specific_params.battery_inverter_power` (watts, captured during sync as
 * `batteryInverterKW`) is used as a capacity proxy so the site is billed on its
 * battery inverter rating instead of at zero.
 *
 * Resolution order (see also `supabase/functions/_shared/effectiveCapacity.ts`,
 * which mirrors this logic for the edge functions):
 *   1. PV capacity present and plausible  -> bill on PV
 *   2. PV capacity missing or 0           -> battery inverter proxy
 *   3. PV capacity flagged unrealistic    -> battery inverter proxy
 *   4. No battery inverter rating either  -> unchanged (zero, keeps its flags)
 */

import { isElumPackage, isEnterpriseEconfPackage } from '@/data/pricingData';

export type CapacitySource = 'pv' | 'battery_inverter' | 'none';

export interface PvSanityVerdict {
  verdict?: string | null;
  ratio?: number | null;
  checkedAt?: string | null;
}

export interface CapacityAssetLike {
  assetId?: string;
  assetName?: string;
  totalMW?: number;
  capacityKWp?: number | null;
  batteryInverterKW?: number | null;
  pvSanity?: PvSanityVerdict | null;
}

/** Sanity verdicts older than this are treated as unknown. */
const SANITY_MAX_AGE_MS = 90 * 86_400_000;

/** True when a stored sanity verdict says the registered PV value is implausible. */
export function hasUnrealisticPv(asset: CapacityAssetLike | null | undefined): boolean {
  const s = asset?.pvSanity;
  if (!s) return false;
  if (s.verdict !== 'too_low' && s.verdict !== 'too_high') return false;
  const ts = s.checkedAt ? Date.parse(s.checkedAt) : NaN;
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts <= SANITY_MAX_AGE_MS;
}

export interface EffectiveCapacity {
  /** MW used for pricing */
  totalMW: number;
  source: CapacitySource;
  /** Battery inverter rating in kW when AMMP reports one */
  batteryInverterKW: number | null;
  /** Registered PV MW as reported by AMMP (before any proxy) */
  registeredMW: number;
}

export function resolveEffectiveCapacity(
  asset: CapacityAssetLike | null | undefined
): EffectiveCapacity {
  const registeredMW = Number(asset?.totalMW ?? 0) || 0;
  const rawKW = asset?.batteryInverterKW;
  const batteryInverterKW =
    rawKW != null && Number.isFinite(Number(rawKW)) && Number(rawKW) > 0 ? Number(rawKW) : null;

  const pvUnusable = registeredMW <= 0 || hasUnrealisticPv(asset);

  if (!pvUnusable) {
    return { totalMW: registeredMW, source: 'pv', batteryInverterKW, registeredMW };
  }
  if (batteryInverterKW != null) {
    return {
      totalMW: batteryInverterKW / 1000,
      source: 'battery_inverter',
      batteryInverterKW,
      registeredMW,
    };
  }
  return {
    totalMW: registeredMW,
    source: registeredMW > 0 ? 'pv' : 'none',
    batteryInverterKW: null,
    registeredMW,
  };
}

/** Packages where the battery-inverter proxy applies (Elum 2026, not Jubaili). */
export function usesBatteryCapacityProxy(packageType?: string | null): boolean {
  if (!packageType) return false;
  if (packageType === 'elum_jubaili') return false;
  return isElumPackage(packageType) || isEnterpriseEconfPackage(packageType);
}

/** Apply the proxy to one asset, returning a copy with the billed MW substituted. */
export function withEffectiveCapacity<T extends CapacityAssetLike>(asset: T): T & {
  capacitySource: CapacitySource;
  registeredMW: number;
} {
  const eff = resolveEffectiveCapacity(asset);
  return {
    ...asset,
    totalMW: eff.totalMW,
    capacityKWp: eff.source === 'battery_inverter' ? eff.totalMW * 1000 : asset.capacityKWp,
    capacitySource: eff.source,
    registeredMW: eff.registeredMW,
  };
}

/** Apply the proxy across an asset list. Returns the input untouched when not applicable. */
export function applyCapacityProxy<T extends CapacityAssetLike>(
  assets: T[] | undefined,
  packageType?: string | null
): T[] | undefined {
  if (!assets || !usesBatteryCapacityProxy(packageType)) return assets;
  return assets.map((a) => withEffectiveCapacity(a)) as T[];
}

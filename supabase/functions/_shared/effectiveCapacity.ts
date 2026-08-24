/**
 * Effective billed capacity per asset — edge-function mirror of
 * `src/lib/effectiveCapacity.ts`.
 *
 * PV first; when the registered PV capacity is missing, zero, or flagged
 * implausible by the capacity sanity check, the site falls back to AMMP's
 * `asset_specific_params.battery_inverter_power` (stored as `batteryInverterKW`).
 */

export type CapacitySource = "pv" | "battery_inverter" | "none";

export interface CapacityAssetLike {
  assetId?: string;
  assetName?: string;
  totalMW?: number;
  capacityKWp?: number | null;
  batteryInverterKW?: number | null;
  pvSanity?: { verdict?: string | null; ratio?: number | null; checkedAt?: string | null } | null;
}

const SANITY_MAX_AGE_MS = 90 * 86_400_000;

export function hasUnrealisticPv(asset: CapacityAssetLike | null | undefined): boolean {
  const s = asset?.pvSanity;
  if (!s) return false;
  if (s.verdict !== "too_low" && s.verdict !== "too_high") return false;
  const ts = s.checkedAt ? Date.parse(s.checkedAt) : NaN;
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts <= SANITY_MAX_AGE_MS;
}

export function resolveEffectiveCapacity(asset: CapacityAssetLike | null | undefined): {
  totalMW: number;
  source: CapacitySource;
  batteryInverterKW: number | null;
  registeredMW: number;
} {
  const registeredMW = Number(asset?.totalMW ?? 0) || 0;
  const raw = asset?.batteryInverterKW;
  const batteryInverterKW =
    raw != null && Number.isFinite(Number(raw)) && Number(raw) > 0 ? Number(raw) : null;

  const pvUnusable = registeredMW <= 0 || hasUnrealisticPv(asset);
  if (!pvUnusable) {
    return { totalMW: registeredMW, source: "pv", batteryInverterKW, registeredMW };
  }
  if (batteryInverterKW != null) {
    return {
      totalMW: batteryInverterKW / 1000,
      source: "battery_inverter",
      batteryInverterKW,
      registeredMW,
    };
  }
  return {
    totalMW: registeredMW,
    source: registeredMW > 0 ? "pv" : "none",
    batteryInverterKW: null,
    registeredMW,
  };
}

/** True when the site's billed capacity comes from the battery inverter rating. */
export function hasBatteryProxy(asset: CapacityAssetLike | null | undefined): boolean {
  return resolveEffectiveCapacity(asset).source === "battery_inverter";
}

/**
 * Read `battery_inverter_power` (watts) from an AMMP asset envelope and return kW.
 * Only the single-asset endpoints populate `asset_specific_params`; the org list
 * endpoint always returns null, so callers must never overwrite a cached value
 * with the null this returns for those payloads.
 */
export function batteryInverterKWFromAsset(asset: any): number | null {
  const raw = asset?.asset_specific_params?.battery_inverter_power;
  if (raw == null) return null;
  const w = Number(raw);
  if (!Number.isFinite(w) || w <= 0) return null;
  return w / 1000;
}

/**
 * Battery-only sites ("storage devices but no PV inverter").
 *
 * The flag is computed during the AMMP sync and stored per asset in
 * `contracts.cached_capabilities.assetBreakdown[].isBatteryOnly`. Support
 * documents and the revision dialog only receive priced site lines, so the
 * pages that already load a contract's cached capabilities register them here
 * and the presentation helpers read from this in-memory registry.
 */

interface BatteryOnlyEntry {
  batteryCapacityKWh: number | null;
}

const registry = new Map<string, BatteryOnlyEntry>();

/** Register the battery-only assets found in a contract's cached capabilities. */
export function registerBatteryOnlyAssets(cachedCapabilities: any): void {
  const assets: any[] = cachedCapabilities?.assetBreakdown ?? cachedCapabilities?.assets ?? [];
  for (const a of assets) {
    if (!a?.assetId) continue;
    const id = String(a.assetId);
    if (a.isBatteryOnly === true) {
      registry.set(id, { batteryCapacityKWh: a.batteryCapacityKWh ?? null });
    } else {
      registry.delete(id);
    }
  }
}

export function isBatteryOnlyAsset(assetId: any): boolean {
  return assetId != null && registry.has(String(assetId));
}

/** Battery capacity in kWh when AMMP reported one, else null. */
export function batteryCapacityKWh(assetId: any): number | null {
  if (assetId == null) return null;
  return registry.get(String(assetId))?.batteryCapacityKWh ?? null;
}

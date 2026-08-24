/**
 * Battery-only sites ("storage devices but no PV inverter").
 *
 * The flag is computed during the AMMP sync and stored per asset in
 * `contracts.cached_capabilities.assetBreakdown[].isBatteryOnly`. Support
 * documents receive only priced site lines, so the pages that already load a
 * contract's cached capabilities register them here and the presentation
 * helpers read from this in-memory registry.
 *
 * Entries are scoped per contract: registering a contract replaces everything
 * previously registered for it, so a session that moves between contracts can
 * never keep showing a stale battery flag. Prefer reading `isBatteryOnly` /
 * `batteryCapacityKWh` straight off the asset object where it is available.
 */

interface BatteryOnlyEntry {
  batteryCapacityKWh: number | null;
}

/** contractId -> assetId -> entry */
const byContract = new Map<string, Map<string, BatteryOnlyEntry>>();

/**
 * Register the battery-only assets found in a contract's cached capabilities,
 * replacing anything registered for that contract before.
 */
export function registerBatteryOnlyAssets(contractId: string, cachedCapabilities: any): void {
  const assets: any[] = cachedCapabilities?.assetBreakdown ?? cachedCapabilities?.assets ?? [];
  const entries = new Map<string, BatteryOnlyEntry>();
  for (const a of assets) {
    if (!a?.assetId || a.isBatteryOnly !== true) continue;
    entries.set(String(a.assetId), { batteryCapacityKWh: a.batteryCapacityKWh ?? null });
  }
  byContract.set(String(contractId), entries);
}

function lookup(assetId: any): BatteryOnlyEntry | undefined {
  if (assetId == null) return undefined;
  const id = String(assetId);
  for (const entries of byContract.values()) {
    const hit = entries.get(id);
    if (hit) return hit;
  }
  return undefined;
}

export function isBatteryOnlyAsset(assetId: any): boolean {
  return lookup(assetId) !== undefined;
}

/** Battery capacity in kWh when AMMP reported one, else null. */
export function batteryCapacityKWh(assetId: any): number | null {
  return lookup(assetId)?.batteryCapacityKWh ?? null;
}

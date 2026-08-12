/**
 * Shared shape of the AMMP asset cache (`contracts.cached_capabilities`).
 *
 * Both `ammp-sync-contract` (writer) and `ammp-device-enrichment` (enricher)
 * read and write these objects, so the types live here to stop them drifting.
 */

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  manufacturer?: string | null;
  model?: string | null;
  dataProvider?: string | null;
}

export interface CachedAssetBreakdown {
  assetId: string;
  assetName: string;
  totalMW: number;
  capacityKWp: number;
  /** Genset rating in kVA (AMMP `genset_capacity` / 1000) */
  gensetKVA?: number | null;
  isHybrid: boolean;
  hasSolcast: boolean;
  deviceCount: number;
  onboardingDate?: string | null;
  /** Date the satellite/Solcast device was created */
  solcastOnboardingDate?: string | null;
  devices: DeviceInfo[];
  deviceEnrichmentAttempted?: boolean;
  /** True when AMMP confirmed the asset genuinely has no devices */
  deviceEnrichmentConfirmedEmpty?: boolean;
}

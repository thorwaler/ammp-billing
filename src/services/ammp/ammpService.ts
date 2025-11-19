/**
 * High-level AMMP API business logic
 */

import { dataApiClient } from './dataApiClient';
import { AssetCapabilities, CustomerAMMPSummary, UUID } from '@/types/ammp-api';

/**
 * Calculate capabilities for a single asset
 */
export async function calculateCapabilities(assetId: string): Promise<AssetCapabilities> {
  const asset = await dataApiClient.getAsset(assetId);
  const devices = await dataApiClient.getAssetDevices(assetId);

  const hasSolcast = devices.some(d => d.data_provider === 'solcast');
  const hasBattery = devices.some(d => 
    d.device_type === 'battery_system' || d.device_type === 'battery_inverter'
  );
  const hasGenset = devices.some(d => d.device_type === 'fuel_sensor');

  return {
    assetId: asset.asset_id,
    assetName: asset.asset_name,
    totalMW: (asset.total_pv_power || 0) / 1_000_000,
    hasSolcast,
    hasBattery,
    hasGenset,
    onboardingDate: null, // Not available in API response
    deviceCount: devices.length,
    devices,
  };
}

/**
 * Get aggregated customer summary for multiple assets
 */
export async function getCustomerSummary(assetIds: UUID[]): Promise<CustomerAMMPSummary> {
  const capabilities = await Promise.all(
    assetIds.map(id => calculateCapabilities(id))
  );

  const summary: CustomerAMMPSummary = {
    totalMW: 0,
    totalSites: capabilities.length,
    sitesWithSolcast: 0,
    sitesWithBattery: 0,
    sitesWithGenset: 0,
    earliestOnboardingDate: null,
    assetCapabilities: {},
  };

  for (const cap of capabilities) {
    summary.totalMW += cap.totalMW;
    if (cap.hasSolcast) summary.sitesWithSolcast++;
    if (cap.hasBattery) summary.sitesWithBattery++;
    if (cap.hasGenset) summary.sitesWithGenset++;
    summary.assetCapabilities[cap.assetId] = cap;
  }

  return summary;
}

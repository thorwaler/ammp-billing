/**
 * High-level AMMP API business logic
 */

import { dataApiClient } from './dataApiClient';
import { AssetCapabilities, CustomerAMMPSummary, UUID } from '@/types/ammp-api';
import { supabase } from '@/integrations/supabase/client';

/**
 * Calculate capabilities for a single asset
 */
export async function calculateCapabilities(assetId: string): Promise<AssetCapabilities> {
  const asset = await dataApiClient.getAsset(assetId);
  const devicesResponse = await dataApiClient.getAssetDevices(assetId);
  
  // Ensure devices is always an array (defensive check)
  const devices = Array.isArray(devicesResponse) ? devicesResponse : [];
  
  if (!Array.isArray(devicesResponse)) {
    console.warn(`Asset ${assetId}: devices is not an array, got:`, devicesResponse);
  }

  const hasSolcast = devices.some(d => d.data_provider === 'solcast');
  const hasBattery = devices.some(d => 
    d.device_type === 'battery_system' || d.device_type === 'battery_inverter'
  );
  const hasGenset = devices.some(d => 
    d.device_type === 'fuel_sensor' || d.device_type === 'genset'
  );

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

/**
 * Sync customer AMMP data by org_id
 * Fetches all assets for an org, calculates capabilities, and stores in database
 */
export async function syncCustomerAMMPData(
  customerId: string, 
  orgId: string,
  onProgress?: (current: number, total: number, assetName: string) => void
) {
  // 1. Fetch all assets
  const allAssets = await dataApiClient.listAssets();
  const orgAssets = allAssets.filter(a => a.org_id === orgId);
  
  if (orgAssets.length === 0) {
    throw new Error(`No assets found for org_id: ${orgId}`);
  }

  // 2. Calculate capabilities for each asset (sequential for progress tracking)
  const capabilities = [];
  for (let i = 0; i < orgAssets.length; i++) {
    const asset = orgAssets[i];
    if (onProgress) {
      onProgress(i + 1, orgAssets.length, asset.asset_name);
    }
    const cap = await calculateCapabilities(asset.asset_id);
    capabilities.push(cap);
  }
  
  // 3. Aggregate data
  const ongridSites = capabilities.filter(c => !c.hasBattery && !c.hasGenset);
  const hybridSites = capabilities.filter(c => c.hasBattery || c.hasGenset);
  
  const summary = {
    totalMW: capabilities.reduce((sum, cap) => sum + cap.totalMW, 0),
    ongridTotalMW: ongridSites.reduce((sum, cap) => sum + cap.totalMW, 0),
    hybridTotalMW: hybridSites.reduce((sum, cap) => sum + cap.totalMW, 0),
    totalSites: capabilities.length,
    ongridSites: ongridSites.length,
    hybridSites: hybridSites.length,
    sitesWithSolcast: capabilities.filter(c => c.hasSolcast).length,
    assetBreakdown: capabilities.map(c => ({
      assetId: c.assetId,
      assetName: c.assetName,
      totalMW: c.totalMW,
      isHybrid: c.hasBattery || c.hasGenset,
      hasSolcast: c.hasSolcast,
      deviceCount: c.deviceCount,
    }))
  };
  
  // 4. Store in database
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('customers')
    .update({
      ammp_capabilities: summary,
      ammp_sync_status: 'synced',
      last_ammp_sync: new Date().toISOString(),
      mwp_managed: summary.totalMW,
      ammp_asset_ids: orgAssets.map(a => a.asset_id),
    })
    .eq('id', customerId)
    .eq('user_id', user.id);
    
  if (error) throw error;
  
  return summary;
}

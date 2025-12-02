/**
 * High-level AMMP API business logic
 */

import { dataApiClient } from './dataApiClient';
import { AssetCapabilities, CustomerAMMPSummary, UUID, SyncAnomalies } from '@/types/ammp-api';
import { supabase } from '@/integrations/supabase/client';

/**
 * Calculate capabilities for a single asset
 * Uses single API call to /assets/{assetId}/devices which returns asset + devices
 * Optionally accepts pre-fetched metadata (e.g., created date) to avoid extra API calls
 */
export async function calculateCapabilities(
  assetId: string,
  assetMetadata?: { created?: string }
): Promise<AssetCapabilities> {
  const asset = await dataApiClient.getAsset(assetId);
  
  // Defensive check: ensure we got a valid asset object
  if (!asset || !asset.asset_id || typeof asset.asset_name !== 'string') {
    console.error(`Invalid asset data received for ${assetId}:`, asset);
    throw new Error(`Failed to fetch valid asset data for ${assetId}`);
  }
  
  const devices = asset.devices || [];

  const hasSolcast = devices.some(d => 
    d.data_provider === 'solcast' || d.device_type === 'satellite'
  );
  const hasBattery = devices.some(d => 
    d.device_type === 'battery_system' || d.device_type === 'battery_inverter'
  );
  const hasGenset = devices.some(d => 
    d.device_type === 'fuel_sensor' || d.device_type === 'genset'
  );

  // Use pre-fetched metadata if provided, otherwise try asset.created (may be null)
  const onboardingDate = assetMetadata?.created || asset.created || null;

  return {
    assetId: asset.asset_id,
    assetName: asset.asset_name,
    totalMW: (asset.total_pv_power || 0) / 1_000_000,
    hasSolcast,
    hasBattery,
    hasGenset,
    onboardingDate,
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
 * Detect anomalies in synced AMMP data
 */
export function detectSyncAnomalies(capabilities: AssetCapabilities[]): SyncAnomalies {
  const totalAssets = capabilities.length;
  const assetsWithNoDevices = capabilities.filter(c => c.deviceCount === 0).length;
  const assetsWithDevices = totalAssets - assetsWithNoDevices;
  const percentageWithNoDevices = (assetsWithNoDevices / totalAssets) * 100;
  
  const warnings: string[] = [];
  
  // Anomaly 1: High percentage of assets with no devices
  if (percentageWithNoDevices > 50 && totalAssets >= 5) {
    warnings.push(
      `${assetsWithNoDevices} of ${totalAssets} assets (${percentageWithNoDevices.toFixed(0)}%) have no devices. ` +
      `This may indicate an API permission issue or data configuration problem.`
    );
  }
  
  // Anomaly 2: ALL assets have no devices (very suspicious)
  if (assetsWithNoDevices === totalAssets && totalAssets > 0) {
    warnings.push(
      `All ${totalAssets} assets have 0 devices. This is highly unusual and likely indicates: ` +
      `(1) API key lacks device read permissions, (2) Wrong API endpoint, or (3) Assets not configured in AMMP.`
    );
  }
  
  // Anomaly 3: No Solcast data anywhere
  const sitesWithSolcast = capabilities.filter(c => c.hasSolcast).length;
  if (sitesWithSolcast === 0 && assetsWithDevices > 0) {
    warnings.push(
      `None of the ${assetsWithDevices} assets with devices have Solcast enabled. ` +
      `Verify Solcast integration is configured in AMMP.`
    );
  }
  
  // Anomaly 4: Very few devices per asset on average
  const totalDevices = capabilities.reduce((sum, c) => sum + c.deviceCount, 0);
  const avgDevicesPerAsset = totalDevices / Math.max(1, assetsWithDevices);
  if (avgDevicesPerAsset < 2 && assetsWithDevices >= 5) {
    warnings.push(
      `Average of ${avgDevicesPerAsset.toFixed(1)} devices per asset is unusually low. ` +
      `Expected 5-10+ devices per solar asset.`
    );
  }
  
  return {
    hasAnomalies: warnings.length > 0,
    warnings,
    stats: {
      totalAssets,
      assetsWithNoDevices,
      assetsWithDevices,
      percentageWithNoDevices,
    }
  };
}

/**
 * Sync customer AMMP data by org_id
 * Fetches all assets for an org, calculates capabilities, and stores in database
 * Uses smart caching to only fetch metadata for assets missing onboardingDate
 */
export async function syncCustomerAMMPData(
  customerId: string, 
  orgId: string,
  onProgress?: (current: number, total: number, assetName: string) => void
) {
  // 1. Fetch all assets from AMMP
  const allAssets = await dataApiClient.listAssets();
  const orgAssets = allAssets.filter(a => a.org_id === orgId);
  
  if (orgAssets.length === 0) {
    throw new Error(`No assets found for org_id: ${orgId}`);
  }

  // 2. Fetch existing customer capabilities to check for cached onboardingDates
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: existingCustomer } = await supabase
    .from('customers')
    .select('ammp_capabilities')
    .eq('id', customerId)
    .eq('user_id', user.id)
    .single();

  const existingCapabilities = (existingCustomer?.ammp_capabilities as any)?.assetBreakdown || [];
  
  // Build a map of existing onboardingDates
  const cachedOnboardingDates: Record<string, string | null> = {};
  for (const asset of existingCapabilities) {
    if (asset.assetId && asset.onboardingDate) {
      cachedOnboardingDates[asset.assetId] = asset.onboardingDate;
    }
  }

  // 3. Identify assets that need metadata fetch (missing onboardingDate)
  const assetsMissingMetadata = orgAssets.filter(a => !cachedOnboardingDates[a.asset_id]);
  
  console.log(`[AMMP Sync] ${orgAssets.length} total assets, ${assetsMissingMetadata.length} need metadata fetch`);

  // 4. Batch fetch metadata ONLY for assets that need it
  const METADATA_BATCH_SIZE = 10;
  const fetchedMetadata: Record<string, string | null> = {};

  for (let i = 0; i < assetsMissingMetadata.length; i += METADATA_BATCH_SIZE) {
    const batch = assetsMissingMetadata.slice(i, i + METADATA_BATCH_SIZE);
    
    const metadataPromises = batch.map(async (asset) => {
      try {
        const metadata = await dataApiClient.getAssetMetadata(asset.asset_id);
        return { assetId: asset.asset_id, created: metadata.created || null };
      } catch (error) {
        console.warn(`[AMMP Sync] Failed to fetch metadata for ${asset.asset_id}:`, error);
        return { assetId: asset.asset_id, created: null };
      }
    });
    
    const results = await Promise.all(metadataPromises);
    for (const result of results) {
      fetchedMetadata[result.assetId] = result.created;
    }
  }

  // 5. Combine cached and newly fetched metadata
  const assetMetadataMap: Record<string, { created?: string }> = {};
  for (const asset of orgAssets) {
    const cachedDate = cachedOnboardingDates[asset.asset_id];
    const fetchedDate = fetchedMetadata[asset.asset_id];
    const created = cachedDate || fetchedDate || undefined;
    if (created) {
      assetMetadataMap[asset.asset_id] = { created };
    }
  }

  // 6. Calculate capabilities in batches (parallel processing with progress tracking)
  const BATCH_SIZE = 10;
  const capabilities: AssetCapabilities[] = [];

  for (let i = 0; i < orgAssets.length; i += BATCH_SIZE) {
    const batch = orgAssets.slice(i, i + BATCH_SIZE);
    
    // Process batch in parallel, passing pre-fetched metadata
    const batchPromises = batch.map(async (asset, batchIndex) => {
      const globalIndex = i + batchIndex;
      if (onProgress) {
        onProgress(globalIndex + 1, orgAssets.length, asset.asset_name);
      }
      return calculateCapabilities(asset.asset_id, assetMetadataMap[asset.asset_id]);
    });
    
    const batchResults = await Promise.all(batchPromises);
    capabilities.push(...batchResults);
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
      onboardingDate: c.onboardingDate,  // Include creation date in breakdown
    }))
  };
  
  // 9. Detect anomalies
  const anomalies = detectSyncAnomalies(capabilities);
  
  // Log warnings to console for debugging
  if (anomalies.hasAnomalies) {
    console.warn('[AMMP Sync] Anomalies detected:', anomalies);
  }
  
  // 10. Store in database (user already fetched earlier)
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
  
  return {
    summary,
    anomalies,
  };
}

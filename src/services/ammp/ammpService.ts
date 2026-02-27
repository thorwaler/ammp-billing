/**
 * High-level AMMP API business logic
 * Uses contract-level sync via ammp-sync-contract Edge Function
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
  const hasHybridEMS = devices.some(d => 
    d.device_type === 'ems' && d.device_name?.toLowerCase().includes('hybrid')
  );

  // Use pre-fetched metadata if provided, otherwise try asset.created (may be null)
  const onboardingDate = assetMetadata?.created || asset.created || null;
  
  // Find Solcast/satellite device's created date for pro-rata fee calculations
  const solcastDevice = devices.find(d => 
    d.data_provider === 'solcast' || d.device_type === 'satellite'
  );
  // Type cast to access 'created' which may exist on the device but not in DeviceResponse type
  const solcastOnboardingDate = hasSolcast 
    ? ((solcastDevice as any)?.created || null) 
    : null;

  return {
    assetId: asset.asset_id,
    assetName: asset.asset_name,
    totalMW: (asset.total_pv_power || 0) / 1_000_000,
    hasSolcast,
    hasBattery,
    hasGenset,
    hasHybridEMS,
    onboardingDate,
    solcastOnboardingDate,
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
 * Sync contract AMMP data
 * Uses the unified ammp-sync-contract Edge Function
 */
export async function syncContractAMMPData(
  contractId: string,
  onProgress?: (current: number, total: number, assetName: string) => void
): Promise<{
  success: boolean;
  totalMW?: number;
  totalSites?: number;
  error?: string;
}> {
  if (onProgress) {
    onProgress(0, 1, 'Starting sync...');
  }

  try {
    const { data, error } = await supabase.functions.invoke('ammp-sync-contract', {
      body: { contractId }
    });

    if (error) {
      throw new Error(error.message || 'Failed to sync contract');
    }

    if (!data?.success) {
      throw new Error(data?.error || 'Sync failed');
    }

    if (onProgress) {
      onProgress(data.totalSites || 1, data.totalSites || 1, 'Complete');
    }

    return {
      success: true,
      totalMW: data.totalMW,
      totalSites: data.totalSites,
    };
  } catch (err) {
    console.error('[AMMP Sync] Contract sync error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * @deprecated Use syncContractAMMPData instead
 * Customer-level sync is deprecated in favor of contract-level sync
 */
export async function syncCustomerAMMPData(
  customerId: string, 
  orgId: string,
  onProgress?: (current: number, total: number, assetName: string) => void
): Promise<{
  summary: any;
  anomalies: SyncAnomalies;
}> {
  console.warn('[AMMP Sync] syncCustomerAMMPData is deprecated. Use syncContractAMMPData instead.');
  
  // This function is deprecated - throw an error directing users to use contract-level sync
  throw new Error(
    'Customer-level AMMP sync is deprecated. ' +
    'Please use contract-level sync via the Contract Details page instead.'
  );
}

/**
 * Auto-populate site_billing_status for customers with per_site contracts
 * Note: This is now handled by the Edge Function, but kept for backwards compatibility
 */
export async function populateSiteBillingStatus(
  customerId: string,
  userId: string,
  assetBreakdown: Array<{
    assetId: string;
    assetName: string;
    totalMW: number;
    onboardingDate?: string | null;
  }>
) {
  // Check if customer has a per_site contract
  const { data: contracts } = await supabase
    .from('contracts')
    .select('id, onboarding_fee_per_site, annual_fee_per_site')
    .eq('customer_id', customerId)
    .eq('user_id', userId)
    .eq('package', 'per_site')
    .eq('contract_status', 'active');
  
  if (!contracts || contracts.length === 0) {
    // No per_site contract, skip
    return;
  }
  
  const contract = contracts[0];
  
  // For each asset, create or update site_billing_status
  for (const asset of assetBreakdown) {
    // Check if record already exists
    const { data: existing } = await supabase
      .from('site_billing_status')
      .select('id, onboarding_fee_paid')
      .eq('asset_id', asset.assetId)
      .eq('contract_id', contract.id)
      .maybeSingle();
    
    if (existing) {
      // Update existing record (only update name/capacity, preserve billing status)
      await supabase
        .from('site_billing_status')
        .update({
          asset_name: asset.assetName,
          asset_capacity_kwp: asset.totalMW * 1000, // Convert MW to kWp
          ...(asset.onboardingDate ? { onboarding_date: asset.onboardingDate } : {}),
        })
        .eq('id', existing.id);
    } else {
      // Create new record
      const onboardingDate = asset.onboardingDate ? new Date(asset.onboardingDate) : new Date();
      const nextAnnualDue = new Date(onboardingDate);
      nextAnnualDue.setFullYear(nextAnnualDue.getFullYear() + 1);
      
      await supabase
        .from('site_billing_status')
        .insert({
          user_id: userId,
          contract_id: contract.id,
          customer_id: customerId,
          asset_id: asset.assetId,
          asset_name: asset.assetName,
          asset_capacity_kwp: asset.totalMW * 1000,
          onboarding_date: onboardingDate.toISOString(),
          onboarding_fee_paid: false,
          next_annual_due_date: nextAnnualDue.toISOString(),
        });
    }
  }
  
  console.log(`[AMMP Sync] Populated site_billing_status for ${assetBreakdown.length} assets`);
}

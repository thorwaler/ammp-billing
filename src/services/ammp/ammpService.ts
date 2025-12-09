/**
 * High-level AMMP API business logic
 * Now uses the unified ammp-sync-customer Edge Function for sync operations
 * with background processing and real progress polling
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

  return {
    assetId: asset.asset_id,
    assetName: asset.asset_name,
    totalMW: (asset.total_pv_power || 0) / 1_000_000,
    hasSolcast,
    hasBattery,
    hasGenset,
    hasHybridEMS,
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

interface SyncJobStatus {
  id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  total_assets: number;
  processed_assets: number;
  current_asset_name: string | null;
  result: any;
  error_message: string | null;
}

/**
 * Poll for sync job status
 */
async function pollJobStatus(jobId: string): Promise<SyncJobStatus> {
  const { data, error } = await supabase
    .from('ammp_sync_jobs')
    .select('id, status, total_assets, processed_assets, current_asset_name, result, error_message')
    .eq('id', jobId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch job status: ${error.message}`);
  }

  return data as SyncJobStatus;
}

/**
 * Sync customer AMMP data by org_id
 * Uses background processing with real progress polling
 */
export async function syncCustomerAMMPData(
  customerId: string, 
  orgId: string,
  onProgress?: (current: number, total: number, assetName: string) => void
): Promise<{
  summary: any;
  anomalies: SyncAnomalies;
}> {
  // Start the sync job
  if (onProgress) {
    onProgress(0, 1, 'Starting sync...');
  }

  const { data, error } = await supabase.functions.invoke('ammp-sync-customer', {
    body: { customerId, orgId }
  });

  if (error) {
    throw new Error(error.message || 'Failed to start sync');
  }

  if (!data?.success || !data?.jobId) {
    throw new Error(data?.error || 'Failed to start sync job');
  }

  const jobId = data.jobId;
  console.log(`[AMMP Sync] Started background job: ${jobId}`);

  // Poll for progress every 2 seconds
  const POLL_INTERVAL = 2000;
  const MAX_POLL_TIME = 10 * 60 * 1000; // 10 minutes max
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const pollInterval = setInterval(async () => {
      try {
        // Check for timeout
        if (Date.now() - startTime > MAX_POLL_TIME) {
          clearInterval(pollInterval);
          reject(new Error('Sync timed out after 10 minutes'));
          return;
        }

        const jobStatus = await pollJobStatus(jobId);
        
        // Report progress
        if (onProgress && jobStatus.total_assets > 0) {
          onProgress(
            jobStatus.processed_assets,
            jobStatus.total_assets,
            jobStatus.current_asset_name || 'Processing...'
          );
        } else if (onProgress) {
          // Still initializing
          onProgress(0, 1, jobStatus.current_asset_name || 'Initializing...');
        }

        // Check if completed
        if (jobStatus.status === 'completed') {
          clearInterval(pollInterval);
          
          if (onProgress) {
            onProgress(
              jobStatus.total_assets,
              jobStatus.total_assets,
              'Complete'
            );
          }

          resolve({
            summary: jobStatus.result?.summary || {},
            anomalies: jobStatus.result?.anomalies || { hasAnomalies: false, warnings: [], stats: {} },
          });
        } else if (jobStatus.status === 'failed') {
          clearInterval(pollInterval);
          reject(new Error(jobStatus.error_message || 'Sync failed'));
        }
      } catch (pollError) {
        console.error('[AMMP Sync] Poll error:', pollError);
        // Don't reject immediately on poll errors, just log and continue
      }
    }, POLL_INTERVAL);
  });
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
          onboarding_date: asset.onboardingDate || null,
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

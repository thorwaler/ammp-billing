import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AssetCapabilities {
  assetId: string;
  assetName: string;
  totalMW: number;
  hasSolcast: boolean;
  hasBattery: boolean;
  hasGenset: boolean;
  hasHybridEMS: boolean;
  onboardingDate?: string | null;
  deviceCount: number;
}

interface SyncAnomalies {
  hasAnomalies: boolean;
  warnings: string[];
  stats: {
    totalAssets: number;
    assetsWithNoDevices: number;
    assetsWithDevices: number;
    percentageWithNoDevices: number;
  };
}

/**
 * Call existing ammp-token-exchange Edge Function internally
 */
async function getToken(apiKey: string): Promise<string> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  const response = await fetch(`${supabaseUrl}/functions/v1/ammp-token-exchange`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ apiKey }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }
  
  const data = await response.json();
  return data.access_token;
}

/**
 * Call existing ammp-data-proxy Edge Function internally
 */
async function fetchAMMPData(token: string, path: string, method: string = 'GET'): Promise<any> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  const response = await fetch(`${supabaseUrl}/functions/v1/ammp-data-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ path, method, token }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AMMP API call failed for ${path}: ${error}`);
  }
  
  return response.json();
}

/**
 * Calculate capabilities for a single asset - CORRECT LOGIC from ammpService.ts
 */
function calculateCapabilities(
  asset: any,
  devices: any[],
  cachedOnboardingDate?: string | null
): AssetCapabilities {
  // Correct Solcast detection: data_provider === 'solcast' OR device_type === 'satellite'
  const hasSolcast = devices.some(d => 
    d.data_provider === 'solcast' || d.device_type === 'satellite'
  );
  
  // Battery detection
  const hasBattery = devices.some(d => 
    d.device_type === 'battery_system' || d.device_type === 'battery_inverter'
  );
  
  // Genset detection
  const hasGenset = devices.some(d => 
    d.device_type === 'fuel_sensor' || d.device_type === 'genset'
  );
  
  // Correct Hybrid EMS detection: device_type === 'ems' AND name contains 'hybrid'
  const hasHybridEMS = devices.some(d => 
    d.device_type === 'ems' && d.device_name?.toLowerCase().includes('hybrid')
  );
  
  // Use cached date first, then asset.created
  const onboardingDate = cachedOnboardingDate || asset.created || null;
  
  return {
    assetId: asset.asset_id,
    assetName: asset.asset_name,
    // Correct MW calculation: total_pv_power is in Watts, divide by 1,000,000
    totalMW: (asset.total_pv_power || 0) / 1_000_000,
    hasSolcast,
    hasBattery,
    hasGenset,
    hasHybridEMS,
    onboardingDate,
    deviceCount: devices.length,
  };
}

/**
 * Detect anomalies in sync results
 */
function detectAnomalies(capabilities: AssetCapabilities[]): SyncAnomalies {
  const totalAssets = capabilities.length;
  const assetsWithNoDevices = capabilities.filter(c => c.deviceCount === 0).length;
  const assetsWithDevices = totalAssets - assetsWithNoDevices;
  const percentageWithNoDevices = totalAssets > 0 ? (assetsWithNoDevices / totalAssets) * 100 : 0;
  
  const warnings: string[] = [];
  
  if (percentageWithNoDevices > 50 && totalAssets >= 5) {
    warnings.push(
      `${assetsWithNoDevices} of ${totalAssets} assets (${percentageWithNoDevices.toFixed(0)}%) have no devices.`
    );
  }
  
  if (assetsWithNoDevices === totalAssets && totalAssets > 0) {
    warnings.push(
      `All ${totalAssets} assets have 0 devices. This may indicate API permission issues.`
    );
  }
  
  const sitesWithSolcast = capabilities.filter(c => c.hasSolcast).length;
  if (sitesWithSolcast === 0 && assetsWithDevices > 0) {
    warnings.push(
      `None of the ${assetsWithDevices} assets with devices have Solcast enabled.`
    );
  }
  
  return {
    hasAnomalies: warnings.length > 0,
    warnings,
    stats: { totalAssets, assetsWithNoDevices, assetsWithDevices, percentageWithNoDevices },
  };
}

/**
 * Populate site_billing_status for per_site contracts
 */
async function populateSiteBillingStatus(
  supabase: any,
  customerId: string,
  userId: string,
  assetBreakdown: Array<{
    assetId: string;
    assetName: string;
    totalMW: number;
    onboardingDate?: string | null;
  }>
) {
  // Check for per_site contract
  const { data: contracts } = await supabase
    .from('contracts')
    .select('id, onboarding_fee_per_site, annual_fee_per_site')
    .eq('customer_id', customerId)
    .eq('user_id', userId)
    .eq('package', 'per_site')
    .eq('contract_status', 'active');
  
  if (!contracts || contracts.length === 0) return;
  
  const contract = contracts[0];
  
  for (const asset of assetBreakdown) {
    const { data: existing } = await supabase
      .from('site_billing_status')
      .select('id, onboarding_fee_paid')
      .eq('asset_id', asset.assetId)
      .eq('contract_id', contract.id)
      .maybeSingle();
    
    if (existing) {
      await supabase
        .from('site_billing_status')
        .update({
          asset_name: asset.assetName,
          asset_capacity_kwp: asset.totalMW * 1000,
          onboarding_date: asset.onboardingDate || null,
        })
        .eq('id', existing.id);
    } else {
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

/**
 * Background sync processing function
 */
async function processSyncInBackground(
  supabase: any,
  jobId: string,
  customerId: string,
  orgId: string,
  effectiveUserId: string,
  token: string
) {
  try {
    console.log(`[AMMP Sync BG] Starting background sync for job ${jobId}`);

    // Fetch all assets
    const allAssets = await fetchAMMPData(token, '/assets');
    
    // Filter by org_id
    const orgAssets = allAssets.filter((a: any) => a.org_id === orgId);
    
    if (orgAssets.length === 0) {
      throw new Error(`No assets found for org_id: ${orgId}`);
    }

    const totalAssets = orgAssets.length;
    console.log(`[AMMP Sync BG] Found ${totalAssets} assets for org ${orgId}`);

    // Update job with total count
    await supabase
      .from('ammp_sync_jobs')
      .update({ 
        status: 'in_progress', 
        total_assets: totalAssets,
        current_asset_name: 'Fetching asset list...'
      })
      .eq('id', jobId);

    // Get existing capabilities for smart caching and change detection
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('ammp_capabilities')
      .eq('id', customerId)
      .single();

    const existingCapabilities = existingCustomer?.ammp_capabilities as any;
    const existingBreakdown = existingCapabilities?.assetBreakdown || [];
    const cachedDates: Record<string, string | null> = {};
    for (const asset of existingBreakdown) {
      if (asset.assetId && asset.onboardingDate) {
        cachedDates[asset.assetId] = asset.onboardingDate;
      }
    }

    // Store previous MW values for change detection
    const oldTotalMW = existingCapabilities?.totalMW || 0;
    const oldOngridMW = existingCapabilities?.ongridTotalMW || 0;
    const oldHybridMW = existingCapabilities?.hybridTotalMW || 0;

    // Identify assets needing metadata fetch
    const assetsMissingMetadata = orgAssets.filter((a: any) => !cachedDates[a.asset_id]);
    console.log(`[AMMP Sync BG] ${assetsMissingMetadata.length} assets need metadata fetch`);

    // Batch fetch metadata for assets missing onboarding dates
    const fetchedMetadata: Record<string, string | null> = {};
    const METADATA_BATCH_SIZE = 10;
    
    for (let i = 0; i < assetsMissingMetadata.length; i += METADATA_BATCH_SIZE) {
      const batch = assetsMissingMetadata.slice(i, i + METADATA_BATCH_SIZE);
      const metadataPromises = batch.map(async (asset: any) => {
        try {
          const metadata = await fetchAMMPData(token, `/assets/${asset.asset_id}`);
          return { assetId: asset.asset_id, created: metadata.created || null };
        } catch (error) {
          console.warn(`Failed to fetch metadata for ${asset.asset_id}:`, error);
          return { assetId: asset.asset_id, created: null };
        }
      });
      
      const results = await Promise.all(metadataPromises);
      for (const result of results) {
        fetchedMetadata[result.assetId] = result.created;
      }
    }

    // Process assets in batches with progress updates
    const capabilities: AssetCapabilities[] = [];
    const BATCH_SIZE = 10;
    let processedCount = 0;

    for (let i = 0; i < orgAssets.length; i += BATCH_SIZE) {
      const batch = orgAssets.slice(i, i + BATCH_SIZE);
      
      const batchPromises = batch.map(async (asset: any) => {
        try {
          // Fetch asset with devices
          const assetData = await fetchAMMPData(token, `/assets/${asset.asset_id}/devices?include_virtual=true`);
          const devices = assetData.devices || [];
          
          // Use cached or fetched onboarding date
          const cachedDate = cachedDates[asset.asset_id] || fetchedMetadata[asset.asset_id];
          
          return calculateCapabilities(
            { ...asset, ...assetData },
            devices,
            cachedDate
          );
        } catch (error) {
          console.error(`Error processing asset ${asset.asset_id}:`, error);
          // Return minimal capability for failed assets
          return {
            assetId: asset.asset_id,
            assetName: asset.asset_name || 'Unknown',
            totalMW: 0,
            hasSolcast: false,
            hasBattery: false,
            hasGenset: false,
            hasHybridEMS: false,
            onboardingDate: cachedDates[asset.asset_id] || fetchedMetadata[asset.asset_id] || null,
            deviceCount: 0,
          };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      capabilities.push(...batchResults);
      processedCount += batch.length;

      // Update progress in database
      const lastAssetName = batch[batch.length - 1]?.asset_name || 'Processing...';
      await supabase
        .from('ammp_sync_jobs')
        .update({ 
          processed_assets: processedCount,
          current_asset_name: lastAssetName
        })
        .eq('id', jobId);
      
      console.log(`[AMMP Sync BG] Progress: ${processedCount}/${totalAssets} - ${lastAssetName}`);
    }

    // Aggregate data
    const ongridSites = capabilities.filter(c => !c.hasBattery && !c.hasGenset && !c.hasHybridEMS);
    const hybridSites = capabilities.filter(c => c.hasBattery || c.hasGenset || c.hasHybridEMS);
    
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
        isHybrid: c.hasBattery || c.hasGenset || c.hasHybridEMS,
        hasSolcast: c.hasSolcast,
        deviceCount: c.deviceCount,
        onboardingDate: c.onboardingDate,
      })),
      lastSyncedAt: new Date().toISOString(),
    };

    console.log(`[AMMP Sync BG] Summary: ${summary.totalSites} sites, ${summary.totalMW.toFixed(4)} MW`);

    // Calculate MW deltas for change detection
    const mwDelta = summary.totalMW - oldTotalMW;

    // Detect anomalies
    const anomalies = detectAnomalies(capabilities);
    if (anomalies.hasAnomalies) {
      console.warn('[AMMP Sync BG] Anomalies detected:', anomalies.warnings);
    }

    // Store sync history for audit trail
    await supabase.from('ammp_sync_history').insert({
      customer_id: customerId,
      user_id: effectiveUserId,
      total_mw: summary.totalMW,
      ongrid_mw: summary.ongridTotalMW,
      hybrid_mw: summary.hybridTotalMW,
      total_sites: summary.totalSites,
      ongrid_sites: summary.ongridSites,
      hybrid_sites: summary.hybridSites,
      sites_with_solcast: summary.sitesWithSolcast,
      previous_total_mw: oldTotalMW,
      mw_delta: mwDelta,
      asset_breakdown: summary.assetBreakdown,
    });

    // Update customer
    await supabase
      .from('customers')
      .update({
        ammp_capabilities: summary,
        ammp_sync_status: 'synced',
        last_ammp_sync: new Date().toISOString(),
        mwp_managed: summary.totalMW,
        ammp_asset_ids: orgAssets.map((a: any) => a.asset_id),
      })
      .eq('id', customerId);

    // Populate site billing status for per_site contracts
    await populateSiteBillingStatus(supabase, customerId, effectiveUserId, summary.assetBreakdown);

    // Mark job as completed
    await supabase
      .from('ammp_sync_jobs')
      .update({ 
        status: 'completed',
        processed_assets: totalAssets,
        current_asset_name: 'Complete',
        completed_at: new Date().toISOString(),
        result: {
          success: true,
          summary,
          anomalies,
          assetsProcessed: capabilities.length,
          mwDelta,
        }
      })
      .eq('id', jobId);

    console.log(`[AMMP Sync BG] Job ${jobId} completed successfully`);

  } catch (error: any) {
    console.error(`[AMMP Sync BG] Job ${jobId} failed:`, error);
    
    // Mark job as failed
    await supabase
      .from('ammp_sync_jobs')
      .update({ 
        status: 'failed',
        error_message: error.message || 'Unknown error',
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { customerId, orgId, apiKey, userId } = await req.json();
    
    if (!customerId || !orgId) {
      return new Response(
        JSON.stringify({ error: 'customerId and orgId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Determine userId - from param, or from JWT if browser call
    let effectiveUserId = userId;
    if (!effectiveUserId) {
      // Try to get from auth header (browser call)
      const authHeader = req.headers.get('Authorization');
      if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user } } = await supabase.auth.getUser(token);
        effectiveUserId = user?.id;
      }
    }
    
    if (!effectiveUserId) {
      return new Response(
        JSON.stringify({ error: 'User authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[AMMP Sync] Starting sync for customer ${customerId}, org ${orgId}`);

    // Get API key from connection if not provided
    let token: string;
    if (apiKey) {
      token = await getToken(apiKey);
    } else {
      const { data: connection } = await supabase
        .from('ammp_connections')
        .select('api_key')
        .eq('user_id', effectiveUserId)
        .single();
      
      if (!connection?.api_key) {
        throw new Error('No AMMP API key found');
      }
      token = await getToken(connection.api_key);
    }

    // Create a sync job record
    const { data: job, error: jobError } = await supabase
      .from('ammp_sync_jobs')
      .insert({
        customer_id: customerId,
        user_id: effectiveUserId,
        status: 'pending',
        current_asset_name: 'Initializing...'
      })
      .select('id')
      .single();

    if (jobError || !job) {
      throw new Error(`Failed to create sync job: ${jobError?.message}`);
    }

    const jobId = job.id;
    console.log(`[AMMP Sync] Created job ${jobId}, starting background processing`);

    // Start background processing using EdgeRuntime.waitUntil
    // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
    EdgeRuntime.waitUntil(
      processSyncInBackground(supabase, jobId, customerId, orgId, effectiveUserId, token)
    );

    // Return immediately with job ID
    return new Response(
      JSON.stringify({ 
        success: true, 
        jobId,
        message: 'Sync started in background'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[AMMP Sync] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

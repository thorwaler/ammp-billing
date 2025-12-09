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

    // Fetch all assets
    const allAssets = await fetchAMMPData(token, '/assets');
    
    // Filter by org_id (CORRECT field name)
    const orgAssets = allAssets.filter((a: any) => a.org_id === orgId);
    
    if (orgAssets.length === 0) {
      throw new Error(`No assets found for org_id: ${orgId}`);
    }

    console.log(`[AMMP Sync] Found ${orgAssets.length} assets for org ${orgId}`);

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
    console.log(`[AMMP Sync] ${assetsMissingMetadata.length} assets need metadata fetch`);

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

    // Process assets in batches
    const capabilities: AssetCapabilities[] = [];
    const BATCH_SIZE = 10;

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
    }

    // Log per-asset details for debugging
    console.log(`[AMMP Sync] === Per-Asset Breakdown ===`);
    for (const c of capabilities) {
      const isHybrid = c.hasBattery || c.hasGenset || c.hasHybridEMS;
      console.log(`[AMMP Sync] Asset: ${c.assetName} | MW: ${c.totalMW.toFixed(4)} | Hybrid: ${isHybrid} | Solcast: ${c.hasSolcast} | Devices: ${c.deviceCount}`);
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

    // Log detailed summary breakdown
    console.log(`[AMMP Sync] === Summary Breakdown ===`);
    console.log(`[AMMP Sync]   Ongrid: ${summary.ongridSites} sites, ${summary.ongridTotalMW.toFixed(4)} MW`);
    console.log(`[AMMP Sync]   Hybrid: ${summary.hybridSites} sites, ${summary.hybridTotalMW.toFixed(4)} MW`);
    console.log(`[AMMP Sync]   Sites with Solcast: ${summary.sitesWithSolcast}`);
    console.log(`[AMMP Sync]   Total: ${summary.totalSites} sites, ${summary.totalMW.toFixed(4)} MW`);

    // Calculate MW deltas for change detection
    const mwDelta = summary.totalMW - oldTotalMW;
    const ongridDelta = summary.ongridTotalMW - oldOngridMW;
    const hybridDelta = summary.hybridTotalMW - oldHybridMW;

    // Log MW change detection
    if (Math.abs(mwDelta) > 0.001) {
      console.log(`[AMMP Sync] ⚠️ MW CHANGE DETECTED for customer ${customerId}:`);
      console.log(`[AMMP Sync]   Total: ${oldTotalMW.toFixed(4)} → ${summary.totalMW.toFixed(4)} (delta: ${mwDelta > 0 ? '+' : ''}${mwDelta.toFixed(4)})`);
      console.log(`[AMMP Sync]   Ongrid: ${oldOngridMW.toFixed(4)} → ${summary.ongridTotalMW.toFixed(4)} (delta: ${ongridDelta > 0 ? '+' : ''}${ongridDelta.toFixed(4)})`);
      console.log(`[AMMP Sync]   Hybrid: ${oldHybridMW.toFixed(4)} → ${summary.hybridTotalMW.toFixed(4)} (delta: ${hybridDelta > 0 ? '+' : ''}${hybridDelta.toFixed(4)})`);
    } else {
      console.log(`[AMMP Sync] No significant MW change detected (delta: ${mwDelta.toFixed(6)})`);
    }

    // Detect anomalies
    const anomalies = detectAnomalies(capabilities);
    if (anomalies.hasAnomalies) {
      console.warn('[AMMP Sync] Anomalies detected:', anomalies.warnings);
    }

    // Store sync history for audit trail
    const { error: historyError } = await supabase.from('ammp_sync_history').insert({
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

    if (historyError) {
      console.warn('[AMMP Sync] Failed to save audit history:', historyError.message);
    } else {
      console.log('[AMMP Sync] Audit history saved successfully');
    }

    // Update customer
    const { error: updateError } = await supabase
      .from('customers')
      .update({
        ammp_capabilities: summary,
        ammp_sync_status: 'synced',
        last_ammp_sync: new Date().toISOString(),
        mwp_managed: summary.totalMW,
        ammp_asset_ids: orgAssets.map((a: any) => a.asset_id),
      })
      .eq('id', customerId);

    if (updateError) throw updateError;

    // Populate site billing status for per_site contracts
    await populateSiteBillingStatus(supabase, customerId, effectiveUserId, summary.assetBreakdown);

    console.log(`[AMMP Sync] Completed: ${summary.totalSites} assets, ${summary.totalMW.toFixed(2)} MW`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        summary, 
        anomalies,
        assetsProcessed: capabilities.length,
        mwDelta: mwDelta,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[AMMP Sync] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
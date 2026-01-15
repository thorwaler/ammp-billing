import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  manufacturer?: string;
  model?: string;
  dataProvider?: string;
}

interface AssetBreakdown {
  assetId: string;
  assetName: string;
  totalMW: number;
  capacityKWp: number;
  isHybrid: boolean;
  hasSolcast: boolean;
  deviceCount: number;
  onboardingDate: string | null;
  solcastOnboardingDate: string | null;
  devices: DeviceInfo[];
  deviceEnrichmentAttempted?: boolean;
  deviceEnrichmentConfirmedEmpty?: boolean; // True when AMMP confirmed no devices exist
}

interface CachedCapabilities {
  totalMW: number;
  ongridMW: number;
  hybridMW: number;
  totalSites: number;
  ongridSites: number;
  hybridSites: number;
  sitesWithSolcast: number;
  assetBreakdown: AssetBreakdown[];
  lastSynced: string;
  needsDeviceEnrichment?: boolean;
  lastDeviceEnrichment?: string;
  deviceEnrichmentProgress?: {
    processed: number;
    total: number;
  };
}

/**
 * Get access token from API key via token exchange
 */
async function getToken(apiKey: string): Promise<string> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  const response = await fetch(`${supabaseUrl}/functions/v1/ammp-token-exchange`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ apiKey }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${errorText}`);
  }
  
  const data = await response.json();
  return data.access_token;
}

/**
 * Fetch data from AMMP API via proxy
 */
async function fetchAMMPData(token: string, path: string): Promise<any> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  const response = await fetch(`${supabaseUrl}/functions/v1/ammp-data-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ token, path }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AMMP API error: ${errorText}`);
  }
  
  return response.json();
}

/**
 * Calculate capabilities from asset and device data
 */
function calculateCapabilitiesFromDevices(
  assetBreakdown: AssetBreakdown,
  devices: any[]
): AssetBreakdown {
  const deviceInfoList: DeviceInfo[] = devices.map((d: any) => ({
    deviceId: d.device_id,
    deviceName: d.device_name || d.name || 'Unknown',
    deviceType: d.device_type || 'unknown',
    manufacturer: d.device_metadata?.manufacturer || undefined,
    model: d.device_metadata?.model || undefined,
    dataProvider: d.device_metadata?.data_provider || undefined,
  }));
  
  // Determine capabilities from devices
  const hasSolcast = devices.some((d: any) => 
    d.device_type === 'weather_station' && 
    (d.device_metadata?.data_provider === 'solcast' || d.device_metadata?.driver === 'solcast')
  );
  
  const hasBattery = devices.some((d: any) => 
    d.device_type === 'battery' || 
    d.device_type === 'battery_inverter' ||
    d.device_type === 'bess'
  );
  
  // Genset detection - includes genset_control which indicates hybrid systems
  const hasGenset = devices.some((d: any) => 
    d.device_type === 'genset' || 
    d.device_type === 'genset_control' ||
    d.device_type === 'generator' ||
    d.device_type === 'diesel_generator' ||
    d.device_type === 'fuel_sensor'
  );
  
  const hasHybridEMS = devices.some((d: any) => 
    d.device_type === 'hybrid_ems' ||
    d.device_type === 'ems' ||
    (d.device_type === 'controller' && d.device_metadata?.controller_type === 'hybrid')
  );
  
  // Detect hybrid via meter names (genset/battery meters)
  const hasHybridMeter = devices.some((d: any) => {
    if (d.device_type !== 'meter') return false;
    const name = (d.device_name || '').toLowerCase();
    return name.includes('gen') || 
           name.includes('genset') || 
           name.includes('generator') ||
           name.includes('battery') || 
           name.includes('batt') || 
           name.includes('bess');
  });
  
  const isHybrid = hasBattery || hasGenset || hasHybridEMS || hasHybridMeter;
  
  // Mark if AMMP confirmed this asset has no devices
  const confirmedEmpty = devices.length === 0;
  
  return {
    ...assetBreakdown,
    hasSolcast: assetBreakdown.hasSolcast || hasSolcast,
    isHybrid: assetBreakdown.isHybrid || isHybrid,
    deviceCount: devices.length,
    devices: deviceInfoList,
    deviceEnrichmentAttempted: true,
    deviceEnrichmentConfirmedEmpty: confirmedEmpty,
  };
}

Deno.serve(async (req) => {
  console.log(`[AMMP Device Enrichment] Request received: ${req.method}`);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !serviceKey) {
      throw new Error('Missing required environment variables');
    }
    
    const supabase = createClient(supabaseUrl, serviceKey);
    
    const { contractId, batchSize = 50, forceRecalculate = false, forceRefetch = false } = await req.json();
    
    if (!contractId) {
      return new Response(
        JSON.stringify({ success: false, error: 'contractId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`[AMMP Device Enrichment] Starting for contract: ${contractId}, batchSize: ${batchSize}, forceRecalculate: ${forceRecalculate}, forceRefetch: ${forceRefetch}`);
    
    // Fetch contract data
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('id, customer_id, user_id, cached_capabilities, ammp_org_id')
      .eq('id', contractId)
      .single();
    
    if (contractError || !contract) {
      throw new Error(`Contract not found: ${contractError?.message}`);
    }
    
    const cachedCapabilities = contract.cached_capabilities as CachedCapabilities | null;
    
    if (!cachedCapabilities?.assetBreakdown || cachedCapabilities.assetBreakdown.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'No asset breakdown found. Run a full sync first.' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // If forceRecalculate is true, recalculate hybrid status from existing device data
    if (forceRecalculate) {
      console.log('[AMMP Device Enrichment] Force recalculating hybrid status from existing devices');
      
      const updatedBreakdown = cachedCapabilities.assetBreakdown.map(asset => {
        // Only recalculate if we have device data
        if (!asset.devices || asset.devices.length === 0) {
          return asset;
        }
        
        // Convert DeviceInfo back to device format for calculation
        const devices = asset.devices.map(d => ({
          device_id: d.deviceId,
          device_name: d.deviceName,
          device_type: d.deviceType,
          device_metadata: {
            manufacturer: d.manufacturer,
            model: d.model,
            data_provider: d.dataProvider,
          }
        }));
        
        // Recalculate using updated detection logic
        return calculateCapabilitiesFromDevices(asset, devices);
      });
      
      // Recalculate aggregates
      const ongridSites = updatedBreakdown.filter(a => !a.isHybrid);
      const hybridSites = updatedBreakdown.filter(a => a.isHybrid);
      
      const updatedCapabilities: CachedCapabilities = {
        ...cachedCapabilities,
        ongridMW: ongridSites.reduce((sum, a) => sum + a.totalMW, 0),
        hybridMW: hybridSites.reduce((sum, a) => sum + a.totalMW, 0),
        ongridSites: ongridSites.length,
        hybridSites: hybridSites.length,
        assetBreakdown: updatedBreakdown,
        lastDeviceEnrichment: new Date().toISOString(),
      };
      
      const { error: updateError } = await supabase
        .from('contracts')
        .update({ cached_capabilities: updatedCapabilities })
        .eq('id', contractId);
      
      if (updateError) {
        throw new Error(`Failed to update contract: ${updateError.message}`);
      }
      
      console.log(`[AMMP Device Enrichment] Recalculated: ${hybridSites.length} hybrid, ${ongridSites.length} ongrid`);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Recalculated hybrid status from existing device data',
          hybridSites: hybridSites.length,
          ongridSites: ongridSites.length,
          hybridMW: updatedCapabilities.hybridMW,
          ongridMW: updatedCapabilities.ongridMW,
          sitesWithSolcast: updatedBreakdown.filter(a => a.hasSolcast).length,
          complete: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Find assets that need device enrichment
    let assetsNeedingEnrichment = cachedCapabilities.assetBreakdown.filter(
      (a) => !a.deviceEnrichmentAttempted && (a.deviceCount === 0 || !a.devices || a.devices.length === 0)
    );
    
    // If forceRefetch, include assets that have no devices BUT exclude those confirmed empty by AMMP
    if (forceRefetch) {
      console.log('[AMMP Device Enrichment] Force refetch enabled - including assets with no devices (excluding confirmed empty)');
      assetsNeedingEnrichment = cachedCapabilities.assetBreakdown.filter(
        (a) => (a.deviceCount === 0 || !a.devices || a.devices.length === 0) && !a.deviceEnrichmentConfirmedEmpty
      );
      const confirmedEmptyCount = cachedCapabilities.assetBreakdown.filter((a) => a.deviceEnrichmentConfirmedEmpty).length;
      console.log(`[AMMP Device Enrichment] Found ${assetsNeedingEnrichment.length} assets to refetch (${confirmedEmptyCount} confirmed empty, skipped)`);
    }
    
    if (assetsNeedingEnrichment.length === 0) {
      console.log('[AMMP Device Enrichment] All assets already have device data');
      
      // Update to remove the needsDeviceEnrichment flag
      const updatedCapabilities: CachedCapabilities = {
        ...cachedCapabilities,
        needsDeviceEnrichment: false,
        lastDeviceEnrichment: new Date().toISOString(),
      };
      
      await supabase
        .from('contracts')
        .update({ cached_capabilities: updatedCapabilities })
        .eq('id', contractId);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'All assets already enriched',
          enriched: 0,
          remaining: 0,
          complete: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`[AMMP Device Enrichment] ${assetsNeedingEnrichment.length} assets need enrichment`);
    
    // Get AMMP API key
    const { data: connection, error: connError } = await supabase
      .from('ammp_connections')
      .select('api_key')
      .eq('user_id', contract.user_id)
      .single();
    
    if (connError || !connection) {
      throw new Error('AMMP connection not found');
    }
    
    // Get access token
    const token = await getToken(connection.api_key);
    console.log('[AMMP Device Enrichment] Token obtained');
    
    // Process a batch of assets
    const batch = assetsNeedingEnrichment.slice(0, batchSize);
    const enrichedAssets: Map<string, AssetBreakdown> = new Map();
    
    const BATCH_PARALLEL = 10; // Parallel requests within the batch
    const startTime = Date.now();
    const MAX_TIME_MS = 25000; // 25 seconds safety margin
    
    for (let i = 0; i < batch.length; i += BATCH_PARALLEL) {
      // Check timeout
      if (Date.now() - startTime > MAX_TIME_MS) {
        console.log(`[AMMP Device Enrichment] Timeout approaching, stopping at ${enrichedAssets.size} assets`);
        break;
      }
      
      const parallelBatch = batch.slice(i, i + BATCH_PARALLEL);
      
      const results = await Promise.allSettled(
        parallelBatch.map(async (asset) => {
          try {
            const devicesResponse = await fetchAMMPData(
              token, 
              `/assets/${asset.assetId}/devices?include_virtual=true`
            );
            const devices = devicesResponse.devices || devicesResponse || [];
            return { assetId: asset.assetId, devices: Array.isArray(devices) ? devices : [] };
          } catch (error) {
            console.warn(`[AMMP Device Enrichment] Failed to fetch devices for ${asset.assetId}:`, error);
            return { assetId: asset.assetId, devices: [] };
          }
        })
      );
      
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { assetId, devices } = result.value;
          const originalAsset = cachedCapabilities.assetBreakdown.find(a => a.assetId === assetId);
          if (originalAsset) {
            const enriched = calculateCapabilitiesFromDevices(originalAsset, devices);
            enrichedAssets.set(assetId, enriched);
          }
        }
      }
      
      console.log(`[AMMP Device Enrichment] Progress: ${enrichedAssets.size}/${batch.length}`);
    }
    
    // Merge enriched assets back into the breakdown
    const updatedBreakdown = cachedCapabilities.assetBreakdown.map(asset => {
      const enriched = enrichedAssets.get(asset.assetId);
      return enriched || asset;
    });
    
    // Recalculate aggregates
    const ongridSites = updatedBreakdown.filter(a => !a.isHybrid);
    const hybridSites = updatedBreakdown.filter(a => a.isHybrid);
    
    const remaining = updatedBreakdown.filter(
      a => !a.deviceEnrichmentAttempted && (a.deviceCount === 0 || !a.devices || a.devices.length === 0)
    ).length;
    
    const updatedCapabilities: CachedCapabilities = {
      totalMW: updatedBreakdown.reduce((sum, a) => sum + a.totalMW, 0),
      ongridMW: ongridSites.reduce((sum, a) => sum + a.totalMW, 0),
      hybridMW: hybridSites.reduce((sum, a) => sum + a.totalMW, 0),
      totalSites: updatedBreakdown.length,
      ongridSites: ongridSites.length,
      hybridSites: hybridSites.length,
      sitesWithSolcast: updatedBreakdown.filter(a => a.hasSolcast).length,
      assetBreakdown: updatedBreakdown,
      lastSynced: cachedCapabilities.lastSynced,
      needsDeviceEnrichment: remaining > 0,
      lastDeviceEnrichment: new Date().toISOString(),
      deviceEnrichmentProgress: {
        processed: updatedBreakdown.length - remaining,
        total: updatedBreakdown.length,
      },
    };
    
    // Update the contract
    const { error: updateError } = await supabase
      .from('contracts')
      .update({ cached_capabilities: updatedCapabilities })
      .eq('id', contractId);
    
    if (updateError) {
      throw new Error(`Failed to update contract: ${updateError.message}`);
    }
    
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[AMMP Device Enrichment] Complete: ${enrichedAssets.size} enriched, ${remaining} remaining (${elapsedSec}s)`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        enriched: enrichedAssets.size,
        remaining: remaining,
        complete: remaining === 0,
        sitesWithSolcast: updatedCapabilities.sitesWithSolcast,
        hybridSites: updatedCapabilities.hybridSites,
        elapsedSeconds: parseFloat(elapsedSec),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[AMMP Device Enrichment] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { postJsonWithRetry, isRateLimited } from '../_shared/internalFetch.ts';
import { fetchAmmpData } from '../_shared/ammpClient.ts';
import { batteryInverterKWFromAsset } from '../_shared/effectiveCapacity.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

import type { DeviceInfo, CachedAssetBreakdown as AssetBreakdown } from '../_shared/ammpTypes.ts';

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

async function resolveAuthorizedUser(
  req: Request,
  supabase: any,
  serviceKey: string,
  requestedUserId?: string,
): Promise<string> {
  const authHeader = req.headers.get('Authorization');
  const bearerToken = authHeader?.startsWith('Bearer ')
    ? authHeader.replace('Bearer ', '')
    : null;
  const isServiceRoleRequest = bearerToken === serviceKey;

  let effectiveUserId = requestedUserId;

  if (!isServiceRoleRequest) {
    if (!bearerToken) {
      throw new Error('User authentication required');
    }

    const { data, error } = await supabase.auth.getUser(bearerToken);
    if (error || !data?.user?.id) {
      throw new Error('Unauthorized');
    }

    effectiveUserId = data.user.id;
  }

  if (!effectiveUserId) {
    throw new Error('User authentication required');
  }

  const { data: canWrite, error: canWriteError } = await supabase.rpc('can_write', {
    _user_id: effectiveUserId,
  });

  if (canWriteError) {
    throw new Error(`Failed to verify permissions: ${canWriteError.message}`);
  }

  if (!canWrite) {
    throw new Error('Forbidden');
  }

  return effectiveUserId;
}

async function getSharedAmmpApiKey(supabase: any): Promise<string> {
  const { data: connection, error } = await supabase
    .from('ammp_connections')
    .select('api_key')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load AMMP connection: ${error.message}`);
  }

  if (!connection?.api_key) {
    throw new Error('AMMP connection not found');
  }

  return connection.api_key;
}

/**
 * Get access token from API key via token exchange
 */
async function getToken(apiKey: string): Promise<string> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const data = await postJsonWithRetry(
    `${supabaseUrl}/functions/v1/ammp-token-exchange`,
    serviceKey,
    { apiKey },
    'Token exchange',
    5,
    'ammp-device-enrichment',
  );
  return data.access_token;
}

/**
 * Fetch data from the AMMP API directly (see `_shared/ammpClient.ts`).
 *
 * Retries with backoff on transient failures — a transient error must never be
 * mistaken for "this asset has no devices".
 */
async function fetchAMMPData(token: string, path: string): Promise<any> {
  return fetchAmmpData(token, path, { logTag: 'ammp-device-enrichment' });
}



/**
 * Calculate capabilities from asset and device data
 */
function calculateCapabilitiesFromDevices(
  assetBreakdown: AssetBreakdown,
  devices: any[],
  assetEnvelope?: any
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
    d.data_provider === 'solcast' || 
    d.device_type === 'satellite' ||
    (d.device_type === 'weather_station' && 
      (d.device_metadata?.data_provider === 'solcast' || d.device_metadata?.driver === 'solcast'))
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

  // Battery-only: storage present, no PV inverter and nothing else that could
  // be reporting PV. Only decided when the asset has a registered PV capacity
  // of zero — otherwise the PV data exists and the site is a normal PV site.
  const hasPvInverter = devices.some((d: any) => {
    const type = (d.device_type || '').toLowerCase();
    if (type === 'battery_inverter') return false;
    return type === 'pv_inverter' || type === 'inverter' || type.includes('pv');
  });
  const hasPvCapablePeripheral = devices.some((d: any) => {
    const type = (d.device_type || '').toLowerCase();
    const name = (d.device_name || '').toLowerCase();
    if (type !== 'ems' && type !== 'meter' && type !== 'satellite') return false;
    return type === 'satellite' || name.includes('pv') || name.includes('solar');
  });
  const isBatteryOnly =
    devices.length > 0 &&
    hasBattery &&
    !hasPvInverter &&
    !hasPvCapablePeripheral &&
    Number(assetBreakdown.capacityKWp ?? 0) === 0;

  // Mark if AMMP confirmed this asset has no devices
  const confirmedEmpty = devices.length === 0;
  
  return {
    ...assetBreakdown,
    hasSolcast: assetBreakdown.hasSolcast || hasSolcast,
    isHybrid: assetBreakdown.isHybrid || isHybrid,
    isBatteryOnly,
    deviceCount: devices.length,
    devices: deviceInfoList,
    deviceEnrichmentAttempted: true,
    deviceEnrichmentConfirmedEmpty: confirmedEmpty,
    // `/assets/{id}/devices` is one of the two endpoints that populate
    // asset_specific_params — never clear a cached rating when it is absent.
    batteryInverterKW:
      batteryInverterKWFromAsset(assetEnvelope) ?? (assetBreakdown as any).batteryInverterKW ?? null,
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
    
    const { contractId, batchSize = 500, forceRecalculate = false, forceRefetch = false, userId, assetIds } = await req.json();
    
    if (!contractId) {
      return new Response(
        JSON.stringify({ success: false, error: 'contractId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await resolveAuthorizedUser(req, supabase, serviceKey, userId);
    
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

    // Targeted refetch: an explicit asset list always wins, regardless of the
    // enrichment flags. Used to pull battery-inverter ratings (only returned by
    // the single-asset endpoints) for a handful of zero-capacity sites.
    if (Array.isArray(assetIds) && assetIds.length > 0) {
      const wanted = new Set(assetIds.map((id: any) => String(id)));
      assetsNeedingEnrichment = cachedCapabilities.assetBreakdown.filter((a) =>
        wanted.has(String(a.assetId)),
      );
      console.log(
        `[AMMP Device Enrichment] Targeted refetch of ${assetsNeedingEnrichment.length}/${wanted.size} requested assets`,
      );
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
    // Get access token
    const token = await getToken(await getSharedAmmpApiKey(supabase));
    console.log('[AMMP Device Enrichment] Token obtained');
    
    // Process a batch of assets
    const batch = assetsNeedingEnrichment.slice(0, batchSize);
    const enrichedAssets: Map<string, AssetBreakdown> = new Map();

    // Enrichment calls the AMMP API directly (no internal gateway hop), so we can
    // run a much wider wave. Failed fetches are still never persisted as "no devices".
    const BATCH_PARALLEL = 12;
    const WAVE_PAUSE_MS = 50;
    const startTime = Date.now();
    const MAX_TIME_MS = 110000; // 110 seconds safety margin

    let failedCount = 0;
    let rateLimited = false;

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
            let envelope: any = devicesResponse;
            // The devices response does not always carry `asset_specific_params`
            // (where `battery_inverter_power` lives). Fall back to the
            // single-asset endpoint only when we still have no rating cached,
            // so full enrichment runs don't double their API calls.
            if (
              batteryInverterKWFromAsset(envelope) == null &&
              (asset as any).batteryInverterKW == null
            ) {
              try {
                const assetResponse = await fetchAMMPData(token, `/assets/${asset.assetId}`);
                const assetObj = assetResponse?.asset ?? assetResponse;
                if (batteryInverterKWFromAsset(assetObj) != null) {
                  envelope = { ...(envelope || {}), ...(assetObj || {}) };
                }


              } catch (e) {
                console.warn(
                  `[AMMP Device Enrichment] asset fetch for ${asset.assetId} failed: ${
                    e instanceof Error ? e.message : String(e)
                  }`,
                );
              }
            }
            return {
              assetId: asset.assetId,
              devices: Array.isArray(devices) ? devices : [],
              envelope,
              failed: false,
            };

          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`[AMMP Device Enrichment] Failed to fetch devices for ${asset.assetId}: ${message}`);
            // Never treat a failed fetch as an empty device list — that would be
            // written back to the cache and permanently mark the asset empty.
            return { assetId: asset.assetId, devices: [], envelope: null, failed: true, message };
          }
        })
      );

      for (const result of results) {
        if (result.status !== 'fulfilled') {
          failedCount++;
          continue;
        }
        const { assetId, devices, envelope, failed, message } = result.value as {
          assetId: string; devices: any[]; envelope: any; failed: boolean; message?: string;
        };
        if (failed) {
          failedCount++;
          if (message && isRateLimited(message)) rateLimited = true;
          continue;
        }
        const originalAsset = cachedCapabilities.assetBreakdown.find(a => a.assetId === assetId);
        if (originalAsset) {
          const enriched = calculateCapabilitiesFromDevices(originalAsset, devices, envelope);
          enrichedAssets.set(assetId, enriched);
        }
      }

      console.log(`[AMMP Device Enrichment] Progress: ${enrichedAssets.size}/${batch.length} (${failedCount} failed)`);

      if (rateLimited) {
        console.warn('[AMMP Device Enrichment] Rate limited — stopping early, remaining assets will retry next run');
        break;
      }

      if (i + BATCH_PARALLEL < batch.length) {
        await new Promise((r) => setTimeout(r, WAVE_PAUSE_MS));
      }
    }

    // Nothing was fetched successfully — do not write anything, and report failure.
    if (enrichedAssets.size === 0 && failedCount > 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.error(`[AMMP Device Enrichment] All ${failedCount} device fetches failed (${elapsed}s)`);
      return new Response(
        JSON.stringify({
          success: false,
          error: rateLimited
            ? 'AMMP API rate limit reached — no assets could be enriched. Try again in a minute.'
            : 'All device fetches failed — no assets could be enriched.',
          enriched: 0,
          failed: failedCount,
          rateLimited,
          remaining: assetsNeedingEnrichment.length,
          complete: false,
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
      // Spread first so fields written by the contract sync (orgBreakdown,
      // doubleCountWarnings, unassignedOrgs, …) survive enrichment.
      ...cachedCapabilities,
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
    console.log(`[AMMP Device Enrichment] Complete: ${enrichedAssets.size} enriched, ${failedCount} failed, ${remaining} remaining (${elapsedSec}s)`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        enriched: enrichedAssets.size,
        failed: failedCount,
        rateLimited,
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

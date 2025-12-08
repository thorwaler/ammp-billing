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
  onboardingDate?: string;
}

interface DeviceResponse {
  id: string;
  name: string;
  device_type: string;
  nodes?: Array<{ variable_ids?: string[] }>;
}

// Check if today matches the configured schedule
function shouldRunToday(schedule: string): boolean {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0 = Sunday
  const dayOfMonth = now.getUTCDate();
  const month = now.getUTCMonth(); // 0-indexed
  const year = now.getUTCFullYear();
  
  // Get last day of current month
  const lastDayOfMonth = new Date(year, month + 1, 0).getUTCDate();
  
  // Check if it's the last day of a quarter (Mar 31, Jun 30, Sep 30, Dec 31)
  const isLastDayOfQuarter = (
    (month === 2 && dayOfMonth === 31) ||  // March 31
    (month === 5 && dayOfMonth === 30) ||  // June 30
    (month === 8 && dayOfMonth === 30) ||  // September 30
    (month === 11 && dayOfMonth === 31)    // December 31
  );

  switch (schedule) {
    case 'daily':
      return true;
    case 'weekly':
      return dayOfWeek === 0; // Sunday
    case 'monthly_first':
      return dayOfMonth === 1;
    case 'monthly_last':
      return dayOfMonth === lastDayOfMonth;
    case 'quarterly_last':
      return isLastDayOfQuarter;
    default:
      return false;
  }
}

// Calculate next sync date based on schedule
function calculateNextSyncAt(schedule: string): Date | null {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  
  switch (schedule) {
    case 'daily':
      const tomorrow = new Date(now);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      tomorrow.setUTCHours(2, 0, 0, 0);
      return tomorrow;
      
    case 'weekly':
      const nextSunday = new Date(now);
      nextSunday.setUTCDate(nextSunday.getUTCDate() + (7 - nextSunday.getUTCDay()));
      nextSunday.setUTCHours(2, 0, 0, 0);
      return nextSunday;
      
    case 'monthly_first':
      const nextFirst = new Date(year, month + 1, 1, 2, 0, 0, 0);
      return nextFirst;
      
    case 'monthly_last':
      const nextLastDay = new Date(year, month + 2, 0, 2, 0, 0, 0);
      return nextLastDay;
      
    case 'quarterly_last':
      // Find next quarter end
      const quarterEnds = [
        new Date(year, 2, 31, 2, 0, 0, 0),   // Mar 31
        new Date(year, 5, 30, 2, 0, 0, 0),   // Jun 30
        new Date(year, 8, 30, 2, 0, 0, 0),   // Sep 30
        new Date(year, 11, 31, 2, 0, 0, 0),  // Dec 31
      ];
      for (const qEnd of quarterEnds) {
        if (qEnd > now) return qEnd;
      }
      // Next year Q1
      return new Date(year + 1, 2, 31, 2, 0, 0, 0);
      
    default:
      return null;
  }
}

// Fetch bearer token from AMMP API
async function getAmmpBearerToken(apiKey: string): Promise<string> {
  const response = await fetch('https://api.ammp.io/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to get AMMP token: ${response.status}`);
  }
  
  const data = await response.json();
  return data.access_token;
}

// Fetch assets from AMMP API
async function fetchAmmpAssets(token: string): Promise<any[]> {
  const response = await fetch('https://data-api.ammp.io/v1/assets', {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch AMMP assets: ${response.status}`);
  }
  
  return response.json();
}

// Fetch devices for an asset
async function fetchAssetDevices(token: string, assetId: string): Promise<DeviceResponse[]> {
  const response = await fetch(`https://data-api.ammp.io/v1/assets/${assetId}/devices?include_virtual=true`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  
  if (!response.ok) {
    // Return empty array on 404 (no devices)
    if (response.status === 404) return [];
    throw new Error(`Failed to fetch devices for ${assetId}: ${response.status}`);
  }
  
  const data = await response.json();
  return data.devices || [];
}

// Calculate capabilities for an asset
function calculateAssetCapabilities(assetId: string, assetName: string, devices: DeviceResponse[], createdDate?: string): AssetCapabilities {
  let totalKW = 0;
  let hasSolcast = false;
  let hasBattery = false;
  let hasGenset = false;

  for (const device of devices) {
    const deviceType = device.device_type?.toLowerCase() || '';
    const deviceName = device.name?.toLowerCase() || '';
    
    // Check for Solcast
    if (deviceType === 'solcast' || deviceName.includes('solcast')) {
      hasSolcast = true;
    }
    
    // Check for battery/hybrid
    if (['battery_system', 'battery_inverter'].includes(deviceType) ||
        (deviceType === 'ems' && deviceName.includes('hybrid'))) {
      hasBattery = true;
    }
    
    // Check for genset
    if (['fuel_sensor', 'genset'].includes(deviceType)) {
      hasGenset = true;
    }
    
    // Calculate total capacity from inverters
    if (deviceType === 'pv_inverter' || deviceType === 'inverter') {
      const nodes = device.nodes || [];
      for (const node of nodes) {
        const variableIds = node.variable_ids || [];
        // Count AC power variables as indicator of capacity
        const acPowerVars = variableIds.filter((v: string) => v.includes('ac_power'));
        if (acPowerVars.length > 0) {
          totalKW += 100; // Estimate 100kW per inverter as fallback
        }
      }
    }
  }

  return {
    assetId,
    assetName,
    totalMW: totalKW / 1000,
    hasSolcast,
    hasBattery,
    hasGenset,
    onboardingDate: createdDate,
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if this is a manual trigger or scheduled
    let isManual = false;
    let targetUserId: string | null = null;
    
    try {
      const body = await req.json();
      isManual = body.manual === true;
      targetUserId = body.user_id || null;
    } catch {
      // No body or invalid JSON - treat as scheduled trigger
    }

    console.log(`AMMP Sync triggered. Manual: ${isManual}, Target user: ${targetUserId || 'all'}`);

    // Get all AMMP connections with their schedules
    let query = supabase
      .from('ammp_connections')
      .select('user_id, api_key, sync_schedule');
    
    if (targetUserId) {
      query = query.eq('user_id', targetUserId);
    }

    const { data: connections, error: connError } = await query;

    if (connError) {
      console.error('Error fetching AMMP connections:', connError);
      throw connError;
    }

    if (!connections || connections.length === 0) {
      console.log('No AMMP connections found');
      return new Response(
        JSON.stringify({ success: true, message: 'No AMMP connections to sync' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: Array<{
      userId: string;
      customersProcessed: number;
      success: boolean;
      error?: string;
    }> = [];

    // Process each connection
    for (const connection of connections) {
      const { user_id, api_key, sync_schedule } = connection;

      // Skip if schedule doesn't match today (unless manual trigger)
      if (!isManual && !shouldRunToday(sync_schedule || 'disabled')) {
        console.log(`Skipping user ${user_id} - schedule "${sync_schedule}" doesn't match today`);
        continue;
      }

      console.log(`Processing AMMP sync for user ${user_id}`);

      try {
        // Get bearer token
        const token = await getAmmpBearerToken(api_key);
        
        // Fetch all assets
        const allAssets = await fetchAmmpAssets(token);
        console.log(`Fetched ${allAssets.length} total assets from AMMP`);

        // Get customers for this user with AMMP org IDs
        const { data: customers, error: custError } = await supabase
          .from('customers')
          .select('id, name, ammp_org_id, ammp_asset_ids')
          .eq('user_id', user_id)
          .not('ammp_org_id', 'is', null);

        if (custError) throw custError;

        let customersProcessed = 0;

        for (const customer of customers || []) {
          try {
            // Filter assets for this customer's org
            const customerAssets = allAssets.filter((a: any) => a.organisation_id === customer.ammp_org_id);
            
            if (customerAssets.length === 0) {
              console.log(`No assets found for customer ${customer.name} (org: ${customer.ammp_org_id})`);
              continue;
            }

            // Calculate capabilities for each asset
            const assetCapabilities: AssetCapabilities[] = [];
            let totalMW = 0;
            let hasSolcast = false;
            let hasBattery = false;
            let hasGenset = false;

            for (const asset of customerAssets) {
              const devices = await fetchAssetDevices(token, asset.id);
              const caps = calculateAssetCapabilities(asset.id, asset.name, devices, asset.created);
              assetCapabilities.push(caps);
              
              totalMW += caps.totalMW;
              if (caps.hasSolcast) hasSolcast = true;
              if (caps.hasBattery) hasBattery = true;
              if (caps.hasGenset) hasGenset = true;
            }

            // Update customer with synced data
            const { error: updateError } = await supabase
              .from('customers')
              .update({
                ammp_asset_ids: customerAssets.map((a: any) => a.id),
                ammp_capabilities: {
                  totalMW,
                  hasSolcast,
                  hasBattery,
                  hasGenset,
                  assetCount: customerAssets.length,
                  assetBreakdown: assetCapabilities,
                  lastSyncedAt: new Date().toISOString(),
                },
                mwp_managed: totalMW,
                last_ammp_sync: new Date().toISOString(),
                ammp_sync_status: 'synced',
              })
              .eq('id', customer.id);

            if (updateError) throw updateError;

            customersProcessed++;
            console.log(`Synced customer ${customer.name}: ${customerAssets.length} assets, ${totalMW.toFixed(2)} MW`);

          } catch (custSyncError: any) {
            console.error(`Error syncing customer ${customer.name}:`, custSyncError);
            // Mark customer as sync failed
            await supabase
              .from('customers')
              .update({ ammp_sync_status: 'error' })
              .eq('id', customer.id);
          }
        }

        // Update connection with last sync time and next sync
        const nextSyncAt = calculateNextSyncAt(sync_schedule || 'disabled');
        await supabase
          .from('ammp_connections')
          .update({
            last_sync_at: new Date().toISOString(),
            next_sync_at: nextSyncAt?.toISOString() || null,
          })
          .eq('user_id', user_id);

        // Create success notification
        await supabase.from('notifications').insert({
          user_id,
          type: 'ammp_sync_complete',
          title: '✅ AMMP Sync Complete',
          message: `Successfully synced ${customersProcessed} customer${customersProcessed !== 1 ? 's' : ''} with AMMP data.`,
          severity: 'info',
          metadata: { customersProcessed, isManual },
        });

        results.push({ userId: user_id, customersProcessed, success: true });

      } catch (userError: any) {
        console.error(`Error processing user ${user_id}:`, userError);

        // Create failure notification
        await supabase.from('notifications').insert({
          user_id,
          type: 'ammp_sync_failed',
          title: '❌ AMMP Sync Failed',
          message: `Failed to sync AMMP data: ${userError.message}`,
          severity: 'error',
          metadata: { error: userError.message, isManual },
        });

        results.push({ userId: user_id, customersProcessed: 0, success: false, error: userError.message });
      }
    }

    console.log('AMMP scheduled sync completed:', results);

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('AMMP scheduled sync error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

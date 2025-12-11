import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  manufacturer: string | null;
  model: string | null;
  dataProvider: string | null;
}

interface AssetCapabilities {
  assetId: string;
  assetName: string;
  totalMW: number;
  capacityKWp: number;
  hasSolcast: boolean;
  hasBattery: boolean;
  hasGenset: boolean;
  hasHybridEMS: boolean;
  onboardingDate?: string | null;
  deviceCount: number;
  devices: DeviceInfo[];
}

interface CachedCapabilities {
  totalMW: number;
  totalSites: number;
  ongridMW: number;
  hybridMW: number;
  ongridSites: number;
  hybridSites: number;
  sitesWithSolcast: number;
  assetBreakdown: Array<{
    assetId: string;
    assetName: string;
    totalMW: number;
    capacityKWp: number;
    isHybrid: boolean;
    hasSolcast: boolean;
    deviceCount: number;
    onboardingDate?: string | null;
    devices: DeviceInfo[];
  }>;
  lastSynced: string;
}

interface SyncResult {
  cachedCapabilities: CachedCapabilities;
  syncStatus: 'synced' | 'partial';
  timedOut: boolean;
  totalExpected: number;
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
 * Calculate capabilities for a single asset
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
  
  // Calculate capacity in kWp (total_pv_power is in Watts)
  const capacityKWp = (asset.total_pv_power || 0) / 1000;
  
  return {
    assetId: asset.asset_id,
    assetName: asset.asset_name,
    totalMW: capacityKWp / 1000, // Convert kWp to MW
    capacityKWp,
    hasSolcast,
    hasBattery,
    hasGenset,
    hasHybridEMS,
    onboardingDate,
    deviceCount: devices.length,
    devices: devices.map(d => ({
      deviceId: d.device_id,
      deviceName: d.device_name || 'Unknown Device',
      deviceType: d.device_type || 'unknown',
      manufacturer: d.manufacturer || null,
      model: d.model || null,
      dataProvider: d.data_provider || null,
    })),
  };
}

/**
 * Fetch asset group members from AMMP API
 * Returns array of { asset_id, asset_name } for each member
 */
async function getAssetGroupMembers(token: string, groupId: string): Promise<{asset_id: string, asset_name: string}[]> {
  try {
    console.log(`[AMMP Sync Contract] Fetching members for group ${groupId}`);
    const response = await fetchAMMPData(token, `/asset_groups/${groupId}/members`);
    
    // API returns: { group_id, group_name, members: [...] }
    const members = response?.members || [];
    
    if (!Array.isArray(members)) {
      console.warn(`[AMMP Sync Contract] Unexpected members format for group ${groupId}:`, typeof response);
      return [];
    }
    
    console.log(`[AMMP Sync Contract] Found ${members.length} members in group ${groupId}`);
    return members.map((m: any) => ({ 
      asset_id: m.asset_id, 
      asset_name: m.asset_name || 'Unknown'
    }));
  } catch (error) {
    console.error(`[AMMP Sync Contract] Failed to fetch group ${groupId} members:`, error);
    return [];
  }
}

interface AssetGroupMember {
  asset_id: string;
  asset_name: string;
}

/**
 * Process contract sync - handles ALL contract types
 * For asset group contracts: uses asset group filtering
 * For org-scoped contracts: uses org_id filtering  
 * For regular contracts: syncs all org assets
 */
async function processContractSync(
  supabase: any,
  contract: any,
  token: string,
  allAssets: any[]
): Promise<SyncResult> {
  const packageType = contract.package;
  const contractId = contract.id;
  
  // Determine org ID: contract.ammp_org_id > customer.ammp_org_id
  const orgId = contract.ammp_org_id || contract.customers?.ammp_org_id;
  
  console.log(`[AMMP Sync Contract] Processing ${packageType} contract ${contractId}, orgId: ${orgId}`);
  
  // Get existing cached capabilities for onboarding dates
  const existingCached = contract.cached_capabilities as CachedCapabilities | null;
  const cachedDates: Record<string, string | null> = {};
  if (existingCached?.assetBreakdown) {
    for (const asset of existingCached.assetBreakdown) {
      if (asset.assetId && asset.onboardingDate) {
        cachedDates[asset.assetId] = asset.onboardingDate;
      }
    }
  }
  
  let assetsToProcess: AssetGroupMember[] = [];
  
  // Determine which assets to process based on contract configuration
  if (contract.ammp_asset_group_id) {
    // Asset group filtering (for elum_epm, elum_jubaili, or any contract with asset group)
    const primaryMembers = await getAssetGroupMembers(token, contract.ammp_asset_group_id);
    assetsToProcess = [...primaryMembers];
    
    // Apply AND filter if configured
    if (contract.ammp_asset_group_id_and) {
      const andMembers = await getAssetGroupMembers(token, contract.ammp_asset_group_id_and);
      const andIds = new Set(andMembers.map(m => m.asset_id));
      assetsToProcess = assetsToProcess.filter(m => andIds.has(m.asset_id));
    }
    
    // Apply NOT filter if configured
    if (contract.ammp_asset_group_id_not) {
      const notMembers = await getAssetGroupMembers(token, contract.ammp_asset_group_id_not);
      const notIds = new Set(notMembers.map(m => m.asset_id));
      assetsToProcess = assetsToProcess.filter(m => !notIds.has(m.asset_id));
    }
    
    console.log(`[AMMP Sync Contract] Asset group filtering: ${assetsToProcess.length} assets`);
  } else if (orgId) {
    // Filter by org ID (for regular contracts or elum_portfolio_os with custom org)
    const orgAssets = allAssets.filter((a: any) => a.org_id === orgId);
    assetsToProcess = orgAssets.map((a: any) => ({ asset_id: a.asset_id, asset_name: a.asset_name }));
    console.log(`[AMMP Sync Contract] Org ${orgId} filtering: ${assetsToProcess.length} assets`);
  } else {
    console.log(`[AMMP Sync Contract] No org ID or asset group for contract ${contractId}`);
    return {
      cachedCapabilities: {
        totalMW: 0,
        totalSites: 0,
        ongridMW: 0,
        hybridMW: 0,
        ongridSites: 0,
        hybridSites: 0,
        sitesWithSolcast: 0,
        assetBreakdown: [],
        lastSynced: new Date().toISOString(),
      },
      syncStatus: 'synced',
      timedOut: false,
      totalExpected: 0
    };
  }
  
  if (assetsToProcess.length === 0) {
    console.log(`[AMMP Sync Contract] No assets found for contract ${contractId}`);
    return {
      cachedCapabilities: {
        totalMW: 0,
        totalSites: 0,
        ongridMW: 0,
        hybridMW: 0,
        ongridSites: 0,
        hybridSites: 0,
        sitesWithSolcast: 0,
        assetBreakdown: [],
        lastSynced: new Date().toISOString(),
      },
      syncStatus: 'synced',
      timedOut: false,
      totalExpected: 0
    };
  }
  
  // Batch fetch full asset data (metadata + devices) for each asset
  const capabilities: AssetCapabilities[] = [];
  const BATCH_SIZE = 50; // Increased from 10 for better parallelization
  const MAX_SYNC_TIME_MS = 50000; // 50 seconds safety margin before timeout
  const syncStartTime = Date.now();
  
  // For large syncs (>200 assets), skip device details to avoid timeout
  const skipDevices = assetsToProcess.length > 200;
  if (skipDevices) {
    console.log(`[AMMP Sync Contract] Large sync (${assetsToProcess.length} assets) - skipping device details`);
  }
  
  let timedOut = false;
  
  for (let i = 0; i < assetsToProcess.length; i += BATCH_SIZE) {
    // Check for timeout before processing batch
    if (Date.now() - syncStartTime > MAX_SYNC_TIME_MS) {
      console.log(`[AMMP Sync Contract] Timeout approaching, saving partial progress (${capabilities.length}/${assetsToProcess.length})`);
      timedOut = true;
      break;
    }
    
    const batch = assetsToProcess.slice(i, i + BATCH_SIZE);
    
    const batchPromises = batch.map(async (member) => {
      try {
        // Fetch full asset details including total_pv_power
        const assetData = await fetchAMMPData(token, `/assets/${member.asset_id}`);
        
        // Fetch devices for capability detection (skip for large syncs)
        let devices: any[] = [];
        if (!skipDevices) {
          try {
            const devicesResponse = await fetchAMMPData(token, `/assets/${member.asset_id}/devices?include_virtual=true`);
            devices = devicesResponse.devices || devicesResponse || [];
            if (!Array.isArray(devices)) devices = [];
          } catch (deviceError) {
            console.warn(`[AMMP Sync Contract] No devices for ${member.asset_id}`);
          }
        }
        
        // Use cached onboarding date if available, otherwise use asset.created
        const cachedDate = cachedDates[member.asset_id] || assetData.created || null;
        
        return calculateCapabilities(
          { ...assetData, asset_id: member.asset_id, asset_name: member.asset_name },
          devices,
          cachedDate
        );
      } catch (error) {
        console.error(`[AMMP Sync Contract] Error processing asset ${member.asset_id}:`, error);
        return {
          assetId: member.asset_id,
          assetName: member.asset_name,
          totalMW: 0,
          capacityKWp: 0,
          hasSolcast: false,
          hasBattery: false,
          hasGenset: false,
          hasHybridEMS: false,
          onboardingDate: cachedDates[member.asset_id] || null,
          deviceCount: 0,
          devices: [],
        };
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    capabilities.push(...batchResults);
    
    const elapsedSec = ((Date.now() - syncStartTime) / 1000).toFixed(1);
    console.log(`[AMMP Sync Contract] Progress: ${Math.min(i + BATCH_SIZE, assetsToProcess.length)}/${assetsToProcess.length} (${elapsedSec}s)`);
  }
  
  // Aggregate data
  const ongridSites = capabilities.filter(c => !c.hasBattery && !c.hasGenset && !c.hasHybridEMS);
  const hybridSites = capabilities.filter(c => c.hasBattery || c.hasGenset || c.hasHybridEMS);
  
  const cachedCapabilities: CachedCapabilities = {
    totalMW: capabilities.reduce((sum, cap) => sum + cap.totalMW, 0),
    ongridMW: ongridSites.reduce((sum, cap) => sum + cap.totalMW, 0),
    hybridMW: hybridSites.reduce((sum, cap) => sum + cap.totalMW, 0),
    totalSites: capabilities.length,
    ongridSites: ongridSites.length,
    hybridSites: hybridSites.length,
    sitesWithSolcast: capabilities.filter(c => c.hasSolcast).length,
    assetBreakdown: capabilities.map(c => ({
      assetId: c.assetId,
      assetName: c.assetName,
      totalMW: c.totalMW,
      capacityKWp: c.capacityKWp,
      isHybrid: c.hasBattery || c.hasGenset || c.hasHybridEMS,
      hasSolcast: c.hasSolcast,
      deviceCount: c.deviceCount,
      onboardingDate: c.onboardingDate,
      devices: c.devices,
    })),
    lastSynced: new Date().toISOString(),
  };
  
  const syncStatus = timedOut ? 'partial' : 'synced';
  console.log(`[AMMP Sync Contract] Summary: ${cachedCapabilities.totalSites} sites, ${cachedCapabilities.totalMW.toFixed(4)} MW (status: ${syncStatus})`);
  
  return { cachedCapabilities, syncStatus, timedOut, totalExpected: assetsToProcess.length };
}

/**
 * Populate site_billing_status for per_site contracts
 */
async function populateSiteBillingStatus(
  supabase: any,
  contractId: string,
  customerId: string,
  userId: string,
  assetBreakdown: Array<{
    assetId: string;
    assetName: string;
    totalMW: number;
    onboardingDate?: string | null;
  }>
) {
  // Check if this is a per_site contract
  const { data: contract } = await supabase
    .from('contracts')
    .select('package, onboarding_fee_per_site, annual_fee_per_site')
    .eq('id', contractId)
    .single();
  
  if (!contract || contract.package !== 'per_site') return;
  
  console.log(`[AMMP Sync Contract] Populating site_billing_status for ${assetBreakdown.length} assets`);
  
  for (const asset of assetBreakdown) {
    const { data: existing } = await supabase
      .from('site_billing_status')
      .select('id, onboarding_fee_paid')
      .eq('asset_id', asset.assetId)
      .eq('contract_id', contractId)
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
          contract_id: contractId,
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
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { contractId, apiKey, userId } = await req.json();
    
    if (!contractId) {
      return new Response(
        JSON.stringify({ error: 'contractId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Determine userId - from param, or from JWT if browser call
    let effectiveUserId = userId;
    if (!effectiveUserId) {
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

    console.log(`[AMMP Sync Contract] Starting sync for contract ${contractId}`);

    // Fetch the contract with customer info - now uses contract.ammp_org_id
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select(`
        id,
        customer_id,
        package,
        ammp_org_id,
        ammp_asset_group_id,
        ammp_asset_group_id_and,
        ammp_asset_group_id_not,
        cached_capabilities,
        customers!inner (
          id,
          ammp_org_id
        )
      `)
      .eq('id', contractId)
      .eq('user_id', effectiveUserId)
      .single();

    if (contractError || !contract) {
      throw new Error(`Contract not found: ${contractError?.message}`);
    }

    // Skip POC contracts
    if (contract.package === 'poc') {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'POC contracts do not need AMMP sync',
          totalSites: 0,
          totalMW: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if contract has org ID (either on contract or customer)
    const orgId = contract.ammp_org_id || (contract.customers as any)?.ammp_org_id;
    
    if (!orgId && !contract.ammp_asset_group_id) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Contract has no AMMP org ID or asset group configured'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    // Fetch all assets (we'll filter by group/org in processContractSync)
    const allAssets = await fetchAMMPData(token, '/assets');
    console.log(`[AMMP Sync Contract] Fetched ${allAssets.length} total assets`);

    // Process the contract
    const syncResult = await processContractSync(supabase, contract, token, allAssets);
    const { cachedCapabilities, syncStatus, timedOut, totalExpected } = syncResult;

    // Update the contract with cached capabilities and sync status
    const { error: updateError } = await supabase
      .from('contracts')
      .update({ 
        cached_capabilities: cachedCapabilities,
        ammp_sync_status: syncStatus,
        last_ammp_sync: new Date().toISOString(),
        ammp_asset_ids: cachedCapabilities.assetBreakdown.map((a: any) => a.assetId)
      })
      .eq('id', contractId);

    if (updateError) {
      throw new Error(`Failed to update contract: ${updateError.message}`);
    }

    // Populate site billing status for per_site contracts
    await populateSiteBillingStatus(
      supabase,
      contractId,
      contract.customer_id,
      effectiveUserId,
      cachedCapabilities.assetBreakdown
    );

    // Update customer's mwp_managed (aggregate from all contracts)
    const { data: customerContracts } = await supabase
      .from('contracts')
      .select('cached_capabilities')
      .eq('customer_id', contract.customer_id)
      .eq('contract_status', 'active')
      .neq('package', 'poc');
    
    const totalCustomerMW = customerContracts?.reduce((sum: number, c: any) => {
      return sum + (c.cached_capabilities?.totalMW || 0);
    }, 0) || 0;
    
    await supabase
      .from('customers')
      .update({ mwp_managed: totalCustomerMW })
      .eq('id', contract.customer_id);

    console.log(`[AMMP Sync Contract] Successfully synced contract ${contractId} (status: ${syncStatus})`);

    return new Response(
      JSON.stringify({ 
        success: true,
        contractId,
        totalSites: cachedCapabilities.totalSites,
        totalMW: cachedCapabilities.totalMW,
        lastSynced: cachedCapabilities.lastSynced,
        syncStatus,
        timedOut,
        totalExpected,
        message: timedOut ? `Partial sync: ${cachedCapabilities.totalSites}/${totalExpected} assets processed` : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[AMMP Sync Contract] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  }>;
  lastSynced: string;
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
 * Process contract-level sync for Elum packages
 * For asset group contracts, fetches members directly then full details for each
 */
async function processContractSync(
  supabase: any,
  contract: any,
  token: string,
  allAssets: any[]
): Promise<CachedCapabilities> {
  const packageType = contract.package;
  console.log(`[AMMP Sync Contract] Processing ${packageType} contract ${contract.id}`);
  
  // For asset group contracts, we get members directly (no need for allAssets)
  let assetGroupMembers: AssetGroupMember[] = [];
  let useAssetGroupApproach = false;
  
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
  
  // For elum_epm and elum_jubaili: filter by asset group
  if ((packageType === 'elum_epm' || packageType === 'elum_jubaili') && contract.ammp_asset_group_id) {
    useAssetGroupApproach = true;
    
    // Get primary group members (returns array of {asset_id, asset_name})
    const primaryMembers = await getAssetGroupMembers(token, contract.ammp_asset_group_id);
    assetGroupMembers = [...primaryMembers];
    
    // Apply AND filter if configured
    if (contract.ammp_asset_group_id_and) {
      const andMembers = await getAssetGroupMembers(token, contract.ammp_asset_group_id_and);
      const andIds = new Set(andMembers.map(m => m.asset_id));
      assetGroupMembers = assetGroupMembers.filter(m => andIds.has(m.asset_id));
    }
    
    // Apply NOT filter if configured
    if (contract.ammp_asset_group_id_not) {
      const notMembers = await getAssetGroupMembers(token, contract.ammp_asset_group_id_not);
      const notIds = new Set(notMembers.map(m => m.asset_id));
      assetGroupMembers = assetGroupMembers.filter(m => !notIds.has(m.asset_id));
    }
    
    console.log(`[AMMP Sync Contract] Asset group filtering: ${assetGroupMembers.length} assets`);
  }
  // For elum_portfolio_os: use contract-specific org_id (needs allAssets)
  else if (packageType === 'elum_portfolio_os' && contract.contract_ammp_org_id) {
    const orgAssets = allAssets.filter(a => a.org_id === contract.contract_ammp_org_id);
    assetGroupMembers = orgAssets.map(a => ({ asset_id: a.asset_id, asset_name: a.asset_name }));
    console.log(`[AMMP Sync Contract] Org ${contract.contract_ammp_org_id} filtering: ${assetGroupMembers.length} assets`);
  }
  
  if (assetGroupMembers.length === 0) {
    console.log(`[AMMP Sync Contract] No assets found for contract ${contract.id}`);
    return {
      totalMW: 0,
      totalSites: 0,
      ongridMW: 0,
      hybridMW: 0,
      ongridSites: 0,
      hybridSites: 0,
      sitesWithSolcast: 0,
      assetBreakdown: [],
      lastSynced: new Date().toISOString(),
    };
  }
  
  // For asset group approach, we need to fetch full asset details for each member
  // Since group endpoint only provides asset_id and asset_name
  const assetsMissingMetadata = assetGroupMembers.filter(m => !cachedDates[m.asset_id]);
  console.log(`[AMMP Sync Contract] ${assetsMissingMetadata.length} assets need metadata fetch`);
  
  // Batch fetch full asset data (metadata + devices) for each member
  // Since asset group endpoint only gives us IDs and names
  const capabilities: AssetCapabilities[] = [];
  const BATCH_SIZE = 10;
  
  for (let i = 0; i < assetGroupMembers.length; i += BATCH_SIZE) {
    const batch = assetGroupMembers.slice(i, i + BATCH_SIZE);
    
    const batchPromises = batch.map(async (member) => {
      try {
        // Fetch full asset details including total_pv_power
        const assetData = await fetchAMMPData(token, `/assets/${member.asset_id}`);
        
        // Fetch devices for capability detection
        let devices: any[] = [];
        try {
          const devicesResponse = await fetchAMMPData(token, `/assets/${member.asset_id}/devices?include_virtual=true`);
          devices = devicesResponse.devices || devicesResponse || [];
          if (!Array.isArray(devices)) devices = [];
        } catch (deviceError) {
          console.warn(`[AMMP Sync Contract] No devices for ${member.asset_id}`);
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
        };
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    capabilities.push(...batchResults);
    
    console.log(`[AMMP Sync Contract] Progress: ${Math.min(i + BATCH_SIZE, assetGroupMembers.length)}/${assetGroupMembers.length}`);
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
    })),
    lastSynced: new Date().toISOString(),
  };
  
  console.log(`[AMMP Sync Contract] Summary: ${cachedCapabilities.totalSites} sites, ${cachedCapabilities.totalMW.toFixed(4)} MW`);
  
  return cachedCapabilities;
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

    // Fetch the contract with customer info
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select(`
        id,
        customer_id,
        package,
        ammp_asset_group_id,
        ammp_asset_group_id_and,
        ammp_asset_group_id_not,
        contract_ammp_org_id,
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

    // Check if this is an Elum package
    const elumPackages = ['elum_epm', 'elum_jubaili', 'elum_portfolio_os'];
    if (!elumPackages.includes(contract.package)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Contract is not an Elum package type',
          package: contract.package 
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

    // Fetch all assets (we'll filter by group/org)
    const allAssets = await fetchAMMPData(token, '/assets');
    console.log(`[AMMP Sync Contract] Fetched ${allAssets.length} total assets`);

    // Process the contract
    const cachedCapabilities = await processContractSync(supabase, contract, token, allAssets);

    // Update the contract with cached capabilities
    const { error: updateError } = await supabase
      .from('contracts')
      .update({ cached_capabilities: cachedCapabilities })
      .eq('id', contractId);

    if (updateError) {
      throw new Error(`Failed to update contract: ${updateError.message}`);
    }

    console.log(`[AMMP Sync Contract] Successfully synced contract ${contractId}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        contractId,
        totalSites: cachedCapabilities.totalSites,
        totalMW: cachedCapabilities.totalMW,
        lastSynced: cachedCapabilities.lastSynced
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

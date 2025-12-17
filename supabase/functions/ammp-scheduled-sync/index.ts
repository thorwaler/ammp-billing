import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Declare EdgeRuntime for Supabase Edge Functions
declare const EdgeRuntime: {
  waitUntil: (promise: Promise<unknown>) => void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 5; // Process 5 contracts in parallel

// Check if today matches the configured schedule
function shouldRunToday(schedule: string): boolean {
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const dayOfMonth = now.getUTCDate();
  const month = now.getUTCMonth();
  const year = now.getUTCFullYear();
  
  const lastDayOfMonth = new Date(year, month + 1, 0).getUTCDate();
  const isLastDayOfQuarter = (
    (month === 2 && dayOfMonth === 31) ||
    (month === 5 && dayOfMonth === 30) ||
    (month === 8 && dayOfMonth === 30) ||
    (month === 11 && dayOfMonth === 31)
  );

  switch (schedule) {
    case 'daily': return true;
    case 'weekly': return dayOfWeek === 0;
    case 'monthly_first': return dayOfMonth === 1;
    case 'monthly_last': return dayOfMonth === lastDayOfMonth;
    case 'quarterly_last': return isLastDayOfQuarter;
    default: return false;
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
      return new Date(year, month + 1, 1, 2, 0, 0, 0);
      
    case 'monthly_last':
      return new Date(year, month + 2, 0, 2, 0, 0, 0);
      
    case 'quarterly_last':
      const quarterEnds = [
        new Date(year, 2, 31, 2, 0, 0, 0),
        new Date(year, 5, 30, 2, 0, 0, 0),
        new Date(year, 8, 30, 2, 0, 0, 0),
        new Date(year, 11, 31, 2, 0, 0, 0),
      ];
      for (const qEnd of quarterEnds) {
        if (qEnd > now) return qEnd;
      }
      return new Date(year + 1, 2, 31, 2, 0, 0, 0);
      
    default:
      return null;
  }
}

/**
 * Call ammp-sync-contract Edge Function for a single contract
 */
async function syncContract(
  contractId: string,
  apiKey: string,
  userId: string
): Promise<{ success: boolean; error?: string; totalSites?: number; totalMW?: number }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/ammp-sync-contract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ contractId, apiKey, userId }),
    });
    
    const result = await response.json();
    
    if (!response.ok || !result.success) {
      return { success: false, error: result.error || 'Contract sync failed' };
    }
    
    return { 
      success: true, 
      totalSites: result.totalSites,
      totalMW: result.totalMW
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

interface SyncableContract {
  id: string;
  package: string;
  company_name: string;
  ammp_org_id: string | null;
  ammp_asset_group_id: string | null;
}

/**
 * Process contracts in background with batched execution and per-contract notifications
 */
async function processContractsInBackground(
  supabase: any,
  connection: { id: string; user_id: string; api_key: string; sync_schedule: string | null },
  syncableContracts: SyncableContract[],
  isManual: boolean
) {
  const { id: connectionId, user_id, api_key, sync_schedule } = connection;
  let contractsProcessed = 0;
  let contractsFailed = 0;
  let totalAssets = 0;
  
  console.log(`[AMMP Background Sync] Starting background processing of ${syncableContracts.length} contracts in batches of ${BATCH_SIZE}`);

  // Process in batches
  for (let i = 0; i < syncableContracts.length; i += BATCH_SIZE) {
    const batch = syncableContracts.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(syncableContracts.length / BATCH_SIZE);
    
    console.log(`[AMMP Background Sync] Processing batch ${batchNumber}/${totalBatches} (${batch.length} contracts)`);
    
    // Process batch in parallel
    const batchResults = await Promise.allSettled(
      batch.map(async (contract) => {
        const result = await syncContract(contract.id, api_key, user_id);
        
        if (result.success) {
          // Create per-contract SUCCESS notification (triggers webhook via database trigger)
          await supabase.from('notifications').insert({
            user_id,
            contract_id: contract.id,
            type: 'ammp_contract_synced',
            title: 'Contract Synced',
            message: `"${contract.company_name}" synced: ${result.totalSites || 0} sites, ${result.totalMW?.toFixed(2) || '0.00'} MW`,
            severity: 'info',
            metadata: { 
              contractId: contract.id,
              companyName: contract.company_name,
              totalSites: result.totalSites, 
              totalMW: result.totalMW,
              batchProgress: `${Math.min(i + BATCH_SIZE, syncableContracts.length)}/${syncableContracts.length}`,
              isManual,
            },
          });
          
          console.log(`[AMMP Background Sync] ✓ Contract ${contract.id} (${contract.company_name}): ${result.totalSites} sites`);
          return { success: true, sites: result.totalSites || 0, mw: result.totalMW || 0 };
        } else {
          // Create per-contract FAILURE notification
          await supabase.from('notifications').insert({
            user_id,
            contract_id: contract.id,
            type: 'ammp_sync_failed',
            title: 'Contract Sync Failed',
            message: `"${contract.company_name}" failed: ${result.error}`,
            severity: 'error',
            metadata: { 
              contractId: contract.id,
              companyName: contract.company_name,
              error: result.error,
              isManual,
            },
          });
          
          // Mark contract as error
          await supabase
            .from('contracts')
            .update({ ammp_sync_status: 'error' })
            .eq('id', contract.id);
          
          console.error(`[AMMP Background Sync] ✗ Contract ${contract.id} (${contract.company_name}): ${result.error}`);
          return { success: false, error: result.error };
        }
      })
    );
    
    // Aggregate batch results
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        if (result.value.success) {
          contractsProcessed++;
          totalAssets += result.value.sites || 0;
        } else {
          contractsFailed++;
        }
      } else {
        contractsFailed++;
      }
    }
  }

  // Final summary notification
  const severity = contractsFailed > 0 ? 'warning' : 'info';
  const summaryMessage = contractsFailed > 0
    ? `Completed: ${contractsProcessed}/${syncableContracts.length} contracts synced (${contractsFailed} failed), ${totalAssets} sites total`
    : `Successfully synced ${contractsProcessed} contract${contractsProcessed !== 1 ? 's' : ''} (${totalAssets} sites total)`;

  await supabase.from('notifications').insert({
    user_id,
    type: 'ammp_sync_complete',
    title: 'AMMP Sync Complete',
    message: summaryMessage,
    severity,
    metadata: { 
      contractsProcessed, 
      contractsFailed,
      totalContracts: syncableContracts.length, 
      totalAssets,
      isManual,
    },
  });

  // Update connection timestamps
  const nextSyncAt = calculateNextSyncAt(sync_schedule || 'disabled');
  await supabase
    .from('ammp_connections')
    .update({
      last_sync_at: new Date().toISOString(),
      next_sync_at: nextSyncAt?.toISOString() || null,
    })
    .eq('id', connectionId);

  console.log(`[AMMP Background Sync] Complete: ${contractsProcessed}/${syncableContracts.length} contracts, ${totalAssets} sites`);
}

Deno.serve(async (req) => {
  console.log(`[AMMP Scheduled Sync] Function invoked at ${new Date().toISOString()}`);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !serviceKey) {
      console.error('[AMMP Scheduled Sync] Missing environment variables');
      throw new Error('Missing required environment variables');
    }
    
    const supabase = createClient(supabaseUrl, serviceKey);

    console.log(`[AMMP Scheduled Sync] Supabase client created`);

    // Check if manual trigger or scheduled
    let isManual = false;
    let targetUserId: string | null = null;
    
    try {
      const body = await req.json();
      isManual = body.manual === true;
      targetUserId = body.user_id || null;
    } catch {
      // No body - scheduled trigger
    }

    console.log(`[AMMP Scheduled Sync] Started. Manual: ${isManual}, Target: ${targetUserId || 'all'}`);

    // Get AMMP connections - shared across team
    let query = supabase
      .from('ammp_connections')
      .select('id, user_id, api_key, sync_schedule');
    
    if (isManual || targetUserId) {
      query = query.limit(1);
    }

    const { data: connections, error: connError } = await query;

    if (connError) throw connError;

    console.log(`[AMMP Scheduled Sync] Found ${connections?.length || 0} AMMP connection(s)`);

    if (!connections || connections.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No AMMP connections to sync' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For manual syncs, use background processing
    if (isManual && connections.length > 0) {
      const connection = connections[0];
      const { id: connectionId, user_id } = connection;

      // Update last_sync_at IMMEDIATELY at the start to show sync was attempted
      await supabase
        .from('ammp_connections')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('id', connectionId);

      // Get all active non-POC contracts with AMMP config
      const { data: contracts, error: contractError } = await supabase
        .from('contracts')
        .select(`
          id, 
          package, 
          company_name, 
          ammp_org_id,
          ammp_asset_group_id,
          customers!inner (
            id,
            ammp_org_id
          )
        `)
        .eq('user_id', user_id)
        .eq('contract_status', 'active')
        .neq('package', 'poc');

      if (contractError) throw contractError;

      // Filter to contracts that have AMMP config and map to simplified structure
      const syncableContracts: SyncableContract[] = (contracts || [])
        .filter((c: any) => c.ammp_org_id || c.ammp_asset_group_id || c.customers?.[0]?.ammp_org_id)
        .map((c: any) => ({
          id: c.id,
          package: c.package,
          company_name: c.company_name,
          ammp_org_id: c.ammp_org_id || c.customers?.[0]?.ammp_org_id || null,
          ammp_asset_group_id: c.ammp_asset_group_id,
        }));

      console.log(`[AMMP Scheduled Sync] Found ${syncableContracts.length} syncable contracts for background processing`);

      if (syncableContracts.length === 0) {
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: 'No contracts with AMMP configuration to sync',
            backgroundProcessing: false,
            totalContracts: 0,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Start background processing
      EdgeRuntime.waitUntil(
        processContractsInBackground(supabase, connection, syncableContracts, isManual)
      );

      // Return immediately with background processing acknowledgment
      return new Response(
        JSON.stringify({
          success: true,
          backgroundProcessing: true,
          totalContracts: syncableContracts.length,
          message: `Sync started for ${syncableContracts.length} contracts. You'll receive notifications as each contract completes.`,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For scheduled syncs, process synchronously (cron has longer timeout)
    const results: Array<{
      userId: string;
      contractsProcessed: number;
      totalAssets: number;
      success: boolean;
      error?: string;
    }> = [];

    for (const connection of connections) {
      const { id: connectionId, user_id, api_key, sync_schedule } = connection;

      // Skip if schedule doesn't match
      if (!shouldRunToday(sync_schedule || 'disabled')) {
        console.log(`[AMMP Scheduled Sync] Skipping connection ${connectionId} - schedule doesn't match`);
        continue;
      }

      console.log(`[AMMP Scheduled Sync] Processing connection ${connectionId} (user ${user_id})`);

      try {
        const { data: contracts, error: contractError } = await supabase
          .from('contracts')
          .select(`
            id, 
            package, 
            company_name, 
            ammp_org_id,
            ammp_asset_group_id,
            customers!inner (
              id,
              ammp_org_id
            )
          `)
          .eq('user_id', user_id)
          .eq('contract_status', 'active')
          .neq('package', 'poc');

        if (contractError) throw contractError;

        // Filter and map contracts
        const syncableContracts: SyncableContract[] = (contracts || [])
          .filter((c: any) => c.ammp_org_id || c.ammp_asset_group_id || c.customers?.[0]?.ammp_org_id)
          .map((c: any) => ({
            id: c.id,
            package: c.package,
            company_name: c.company_name,
            ammp_org_id: c.ammp_org_id || c.customers?.[0]?.ammp_org_id || null,
            ammp_asset_group_id: c.ammp_asset_group_id,
          }));

        console.log(`[AMMP Scheduled Sync] Found ${syncableContracts.length} syncable contracts`);

        // Process in background for scheduled syncs too
        await processContractsInBackground(supabase, connection, syncableContracts, false);

        results.push({ userId: user_id, contractsProcessed: syncableContracts.length, totalAssets: 0, success: true });

      } catch (userError: any) {
        console.error(`[AMMP Scheduled Sync] Error for user ${user_id}:`, userError);

        await supabase.from('notifications').insert({
          user_id,
          type: 'ammp_sync_failed',
          title: 'AMMP Sync Failed',
          message: `Sync failed: ${userError.message}`,
          severity: 'error',
          metadata: { error: userError.message, isManual: false },
        });

        results.push({ userId: user_id, contractsProcessed: 0, totalAssets: 0, success: false, error: userError.message });
      }
    }

    console.log('[AMMP Scheduled Sync] Completed:', results);

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[AMMP Scheduled Sync] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

Deno.serve(async (req) => {
  console.log(`[AMMP Scheduled Sync] Function invoked at ${new Date().toISOString()}`);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
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

    // Get AMMP connections - shared across team, don't filter by user_id for manual syncs
    // For scheduled syncs, process all connections; for manual, get the shared connection
    let query = supabase
      .from('ammp_connections')
      .select('id, user_id, api_key, sync_schedule');
    
    // Don't filter by user_id - connections are shared across team
    // Just limit to 1 for manual triggers since there should only be one shared connection
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

    const results: Array<{
      userId: string;
      contractsProcessed: number;
      totalAssets: number;
      success: boolean;
      error?: string;
    }> = [];

    // Process each connection
    for (const connection of connections) {
      const { id: connectionId, user_id, api_key, sync_schedule } = connection;

      // Skip if schedule doesn't match (unless manual)
      if (!isManual && !shouldRunToday(sync_schedule || 'disabled')) {
        console.log(`[AMMP Scheduled Sync] Skipping connection ${connectionId} - schedule doesn't match`);
        continue;
      }

      console.log(`[AMMP Scheduled Sync] Processing connection ${connectionId} (user ${user_id})`);

      try {
        // Get all active non-POC contracts with AMMP org ID (on contract or customer)
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

        // Filter to contracts that have either contract-level or customer-level AMMP config
        const syncableContracts = contracts?.filter((c: any) => 
          c.ammp_org_id || c.ammp_asset_group_id || c.customers?.ammp_org_id
        ) || [];

        console.log(`[AMMP Scheduled Sync] Found ${syncableContracts.length} syncable contracts`);

        let contractsProcessed = 0;
        let totalAssets = 0;

        // Sync each contract
        for (const contract of syncableContracts) {
          console.log(`[AMMP Scheduled Sync] Syncing contract ${contract.id} (${contract.package}) - ${contract.company_name}`);
          
          const result = await syncContract(contract.id, api_key, user_id);
          
          if (result.success) {
            contractsProcessed++;
            totalAssets += result.totalSites || 0;
            console.log(`[AMMP Scheduled Sync] ✓ Contract ${contract.id}: ${result.totalSites} sites, ${result.totalMW?.toFixed(4)} MW`);
          } else {
            console.error(`[AMMP Scheduled Sync] ✗ Contract ${contract.id}: ${result.error}`);
            
            // Mark contract as error
            await supabase
              .from('contracts')
              .update({ ammp_sync_status: 'error' })
              .eq('id', contract.id);
            
            // Create notification for contract-level failure (Bug #4)
            await supabase.from('notifications').insert({
              user_id,
              contract_id: contract.id,
              type: 'ammp_sync_failed',
              title: 'AMMP Contract Sync Failed',
              message: `Contract "${contract.company_name}" sync failed: ${result.error}`,
              severity: 'error',
              metadata: { contractId: contract.id, error: result.error, isManual },
            });
          }
        }

        // Update connection timestamps using connection ID (shared connection)
        const nextSyncAt = calculateNextSyncAt(sync_schedule || 'disabled');
        console.log(`[AMMP Scheduled Sync] Updating connection ${connectionId} last_sync_at`);
        await supabase
          .from('ammp_connections')
          .update({
            last_sync_at: new Date().toISOString(),
            next_sync_at: nextSyncAt?.toISOString() || null,
          })
          .eq('id', connectionId);

        // Create notification
        await supabase.from('notifications').insert({
          user_id,
          type: 'ammp_sync_complete',
          title: 'AMMP Sync Complete',
          message: `Successfully synced ${contractsProcessed} contract${contractsProcessed !== 1 ? 's' : ''} (${totalAssets} sites total).`,
          severity: 'info',
          metadata: { contractsProcessed, totalAssets, isManual },
        });

        results.push({ userId: user_id, contractsProcessed, totalAssets, success: true });

      } catch (userError: any) {
        console.error(`[AMMP Scheduled Sync] Error for user ${user_id}:`, userError);

        await supabase.from('notifications').insert({
          user_id,
          type: 'ammp_sync_failed',
          title: 'AMMP Sync Failed',
          message: `Sync failed: ${userError.message}`,
          severity: 'error',
          metadata: { error: userError.message, isManual },
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

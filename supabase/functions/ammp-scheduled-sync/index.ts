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

// Elum package types that need contract-level sync
const ELUM_PACKAGES = ['elum_epm', 'elum_jubaili', 'elum_portfolio_os'];

/**
 * Call ammp-sync-customer Edge Function for a single customer
 */
async function syncCustomer(
  customerId: string,
  orgId: string,
  apiKey: string,
  userId: string
): Promise<{ success: boolean; error?: string; assetsProcessed?: number }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/ammp-sync-customer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ customerId, orgId, apiKey, userId }),
    });
    
    const result = await response.json();
    
    if (!response.ok || !result.success) {
      return { success: false, error: result.error || 'Sync failed' };
    }
    
    return { success: true, assetsProcessed: result.assetsProcessed };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Call ammp-sync-contract Edge Function for Elum contracts
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

/**
 * Check if a customer has any Elum contracts (needs contract-level sync)
 */
async function getElumContracts(supabase: any, customerId: string, userId: string): Promise<any[]> {
  const { data: contracts } = await supabase
    .from('contracts')
    .select('id, package, company_name')
    .eq('customer_id', customerId)
    .eq('user_id', userId)
    .eq('contract_status', 'active')
    .in('package', ELUM_PACKAGES);
  
  return contracts || [];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

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

    // Get AMMP connections
    let query = supabase
      .from('ammp_connections')
      .select('user_id, api_key, sync_schedule');
    
    if (targetUserId) {
      query = query.eq('user_id', targetUserId);
    }

    const { data: connections, error: connError } = await query;

    if (connError) throw connError;

    if (!connections || connections.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No AMMP connections to sync' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: Array<{
      userId: string;
      customersProcessed: number;
      totalAssets: number;
      success: boolean;
      error?: string;
    }> = [];

    // Process each connection
    for (const connection of connections) {
      const { user_id, api_key, sync_schedule } = connection;

      // Skip if schedule doesn't match (unless manual)
      if (!isManual && !shouldRunToday(sync_schedule || 'disabled')) {
        console.log(`[AMMP Scheduled Sync] Skipping user ${user_id} - schedule doesn't match`);
        continue;
      }

      console.log(`[AMMP Scheduled Sync] Processing user ${user_id}`);

      try {
        // Get customers with AMMP org IDs
        const { data: customers, error: custError } = await supabase
          .from('customers')
          .select('id, name, ammp_org_id')
          .eq('user_id', user_id)
          .not('ammp_org_id', 'is', null);

        if (custError) throw custError;

        let customersProcessed = 0;
        let totalAssets = 0;

        // Sync each customer
        for (const customer of customers || []) {
          console.log(`[AMMP Scheduled Sync] Processing customer ${customer.name}`);
          
          // Check if customer has Elum contracts (need contract-level sync)
          const elumContracts = await getElumContracts(supabase, customer.id, user_id);
          
          if (elumContracts.length > 0) {
            // Sync Elum contracts individually (fast, asset-group scoped)
            console.log(`[AMMP Scheduled Sync] Customer ${customer.name} has ${elumContracts.length} Elum contracts - using contract-level sync`);
            
            let contractsSuccess = 0;
            let contractAssets = 0;
            
            for (const contract of elumContracts) {
              console.log(`[AMMP Scheduled Sync] Syncing Elum contract ${contract.id} (${contract.package})`);
              
              const contractResult = await syncContract(contract.id, api_key, user_id);
              
              if (contractResult.success) {
                contractsSuccess++;
                contractAssets += contractResult.totalSites || 0;
                console.log(`[AMMP Scheduled Sync] ✓ Contract ${contract.id}: ${contractResult.totalSites} sites, ${contractResult.totalMW?.toFixed(4)} MW`);
              } else {
                console.error(`[AMMP Scheduled Sync] ✗ Contract ${contract.id}: ${contractResult.error}`);
              }
            }
            
            if (contractsSuccess > 0) {
              customersProcessed++;
              totalAssets += contractAssets;
            }
          } else {
            // Regular customer-level sync (for non-Elum customers)
            const result = await syncCustomer(
              customer.id,
              customer.ammp_org_id!,
              api_key,
              user_id
            );
            
            if (result.success) {
              customersProcessed++;
              totalAssets += result.assetsProcessed || 0;
              console.log(`[AMMP Scheduled Sync] ✓ ${customer.name}: ${result.assetsProcessed} assets`);
            } else {
              console.error(`[AMMP Scheduled Sync] ✗ ${customer.name}: ${result.error}`);
              // Mark customer as error
              await supabase
                .from('customers')
                .update({ ammp_sync_status: 'error' })
                .eq('id', customer.id);
            }
          }
        }

        // Update connection timestamps
        const nextSyncAt = calculateNextSyncAt(sync_schedule || 'disabled');
        await supabase
          .from('ammp_connections')
          .update({
            last_sync_at: new Date().toISOString(),
            next_sync_at: nextSyncAt?.toISOString() || null,
          })
          .eq('user_id', user_id);

        // Create notification
        await supabase.from('notifications').insert({
          user_id,
          type: 'ammp_sync_complete',
          title: 'AMMP Sync Complete',
          message: `Successfully synced ${customersProcessed} customer${customersProcessed !== 1 ? 's' : ''} (${totalAssets} assets total).`,
          severity: 'info',
          metadata: { customersProcessed, totalAssets, isManual },
        });

        results.push({ userId: user_id, customersProcessed, totalAssets, success: true });

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

        results.push({ userId: user_id, customersProcessed: 0, totalAssets: 0, success: false, error: userError.message });
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

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

  switch (schedule) {
    case 'daily': return true;
    case 'weekly': return dayOfWeek === 0; // Sunday
    case 'monthly': return dayOfMonth === 1; // First of month
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
      tomorrow.setUTCHours(3, 0, 0, 0); // 3 AM UTC
      return tomorrow;
      
    case 'weekly':
      const nextSunday = new Date(now);
      nextSunday.setUTCDate(nextSunday.getUTCDate() + (7 - nextSunday.getUTCDay()));
      nextSunday.setUTCHours(3, 0, 0, 0);
      return nextSunday;
      
    case 'monthly':
      return new Date(year, month + 1, 1, 3, 0, 0, 0);
      
    default:
      return null;
  }
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
    
    try {
      const body = await req.json();
      isManual = body.manual === true;
    } catch {
      // No body - scheduled trigger
    }

    console.log(`[Xero Scheduled Sync] Started. Manual: ${isManual}`);

    // Get Xero connections with sync enabled
    const { data: connections, error: connError } = await supabase
      .from('xero_connections')
      .select('id, user_id, sync_schedule, tenant_name')
      .eq('is_enabled', true);

    if (connError) throw connError;

    if (!connections || connections.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No Xero connections to sync' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: Array<{
      connectionId: string;
      tenantName: string | null;
      synced: number;
      updated: number;
      skipped: number;
      success: boolean;
      error?: string;
    }> = [];

    // Process each connection
    for (const connection of connections) {
      const { id, user_id, sync_schedule, tenant_name } = connection;

      // Skip if schedule doesn't match (unless manual)
      if (!isManual && !shouldRunToday(sync_schedule || 'disabled')) {
        console.log(`[Xero Scheduled Sync] Skipping connection ${id} - schedule doesn't match`);
        continue;
      }

      console.log(`[Xero Scheduled Sync] Processing connection ${id} (${tenant_name})`);

      try {
        // Call xero-sync-invoices function
        const response = await fetch(`${supabaseUrl}/functions/v1/xero-sync-invoices`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ 
            // Default to last 30 days for scheduled sync
            fromDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
          }),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Invoice sync failed');
        }

        // Update connection timestamps
        const nextSyncAt = calculateNextSyncAt(sync_schedule || 'disabled');
        await supabase
          .from('xero_connections')
          .update({
            last_sync_at: new Date().toISOString(),
            next_sync_at: nextSyncAt?.toISOString() || null,
          })
          .eq('id', id);

        // Create success notification
        await supabase.from('notifications').insert({
          user_id,
          type: 'xero_sync_complete',
          title: 'Xero Sync Complete',
          message: `Successfully synced ${result.syncedCount || 0} invoices, updated ${result.updatedCount || 0}, skipped ${result.skippedCount || 0}.`,
          severity: 'info',
          metadata: { 
            syncedCount: result.syncedCount, 
            updatedCount: result.updatedCount,
            skippedCount: result.skippedCount,
            isManual 
          },
        });

        results.push({ 
          connectionId: id, 
          tenantName: tenant_name,
          synced: result.syncedCount || 0,
          updated: result.updatedCount || 0,
          skipped: result.skippedCount || 0,
          success: true 
        });

        console.log(`[Xero Scheduled Sync] ✓ Connection ${id}: synced ${result.syncedCount}, updated ${result.updatedCount}`);

      } catch (connError: any) {
        console.error(`[Xero Scheduled Sync] ✗ Connection ${id}:`, connError);

        // Create error notification
        await supabase.from('notifications').insert({
          user_id,
          type: 'xero_sync_failed',
          title: 'Xero Sync Failed',
          message: `Sync failed: ${connError.message}`,
          severity: 'error',
          metadata: { error: connError.message, isManual },
        });

        results.push({ 
          connectionId: id, 
          tenantName: tenant_name,
          synced: 0,
          updated: 0,
          skipped: 0,
          success: false, 
          error: connError.message 
        });
      }
    }

    console.log('[Xero Scheduled Sync] Completed:', results);

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[Xero Scheduled Sync] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

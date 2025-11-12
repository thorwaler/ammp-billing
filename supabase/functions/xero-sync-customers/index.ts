import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to parse Xero's .NET JSON date format
function parseXeroDate(dateString: string | null | undefined): string {
  if (!dateString) return new Date().toISOString();
  
  // Xero returns dates in format: "/Date(1762202102240+0000)/"
  const match = dateString.match(/\/Date\((\d+)([\+\-]\d{4})?\)\//);
  if (match) {
    const timestamp = parseInt(match[1]);
    return new Date(timestamp).toISOString();
  }
  
  // If not in expected format, try parsing as regular date or return current date
  try {
    return new Date(dateString).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

async function getValidAccessToken(supabase: any, userId: string) {
  const { data: connection } = await supabase
    .from('xero_connections')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!connection) {
    throw new Error('No Xero connection found');
  }

  // Check if token is expired
  const expiresAt = new Date(connection.expires_at);
  const now = new Date();
  
  if (expiresAt <= now) {
    // Token expired, refresh it
    const clientId = Deno.env.get('XERO_CLIENT_ID');
    const clientSecret = Deno.env.get('XERO_CLIENT_SECRET');

    const tokenResponse = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: connection.refresh_token,
      }),
    });

    const tokens = await tokenResponse.json();
    const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    await supabase.from('xero_connections').update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: newExpiresAt,
    }).eq('user_id', userId);

    return { accessToken: tokens.access_token, tenantId: connection.tenant_id };
  }

  return { accessToken: connection.access_token, tenantId: connection.tenant_id };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    console.log('Starting customer sync for user:', user.id);

    // Get valid access token
    const { accessToken, tenantId } = await getValidAccessToken(supabase, user.id);

    // Fetch contacts from Xero
    const xeroResponse = await fetch('https://api.xero.com/api.xro/2.0/Contacts', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Xero-tenant-id': tenantId,
        'Accept': 'application/json',
      },
    });

    if (!xeroResponse.ok) {
      const errorText = await xeroResponse.text();
      console.error('Xero API error:', errorText);
      throw new Error(`Xero API error: ${errorText}`);
    }

    const xeroData = await xeroResponse.json();
    const contacts = xeroData.Contacts || [];
    
    console.log(`Fetched ${contacts.length} contacts from Xero`);

    // Sync contacts to local database
    let syncedCount = 0;
    let errorCount = 0;

    for (const contact of contacts) {
      try {
        // Map Xero contact to our customers table structure
        const customerData = {
          user_id: user.id,
          name: contact.Name || 'Unknown',
          location: contact.Addresses?.[0]?.City || null,
          mwp_managed: 0, // Default value, can be updated manually
          status: contact.ContactStatus === 'ACTIVE' ? 'active' : 'inactive',
          join_date: parseXeroDate(contact.UpdatedDateUTC),
        };

        // Upsert customer (create or update by name)
        const { error: upsertError } = await supabase
          .from('customers')
          .upsert(customerData, {
            onConflict: 'name,user_id',
            ignoreDuplicates: false
          });

        if (upsertError) {
          console.error(`Error upserting customer ${contact.Name}:`, upsertError);
          errorCount++;
        } else {
          syncedCount++;
        }
      } catch (err) {
        console.error('Error processing contact:', err);
        errorCount++;
      }
    }

    console.log(`Customer sync complete. Synced: ${syncedCount}, Errors: ${errorCount}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        syncedCount,
        errorCount,
        totalContacts: contacts.length 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in xero-sync-customers:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

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

async function getValidAccessToken(supabase: any) {
  // Fetch ANY existing Xero connection (shared across team)
  const { data: connection } = await supabase
    .from('xero_connections')
    .select('*')
    .limit(1)
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

    // Update stored tokens using connection ID (shared connection)
    await supabase.from('xero_connections').update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: newExpiresAt,
    }).eq('id', connection.id);

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

    // Get valid access token (from shared connection)
    const { accessToken, tenantId } = await getValidAccessToken(supabase);

    // Fetch all local customers first to track deletions
    const { data: localCustomers, error: localError } = await supabase
      .from('customers')
      .select('id, name, manual_status_override')
      .eq('user_id', user.id);

    if (localError) {
      console.error('Error fetching local customers:', localError);
      throw new Error('Failed to fetch local customers');
    }

    const localCustomerMap = new Map(
      localCustomers?.map(c => [c.name.toLowerCase(), { 
        id: c.id, 
        name: c.name,
        manual_status_override: c.manual_status_override 
      }]) || []
    );
    console.log(`Found ${localCustomerMap.size} local customers`);

    // Fetch customers from Xero (include archived)
    const xeroResponse = await fetch('https://api.xero.com/api.xro/2.0/Contacts?where=IsCustomer==true&includeArchived=true', {
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

    // Helper function for status mapping
    const getCustomerStatus = (contactStatus: string): string => {
      switch (contactStatus) {
        case 'ACTIVE':
          return 'active';
        case 'ARCHIVED':
        case 'GDPRREQUEST':
          return 'inactive';
        default:
          console.warn(`Unknown ContactStatus: ${contactStatus}`);
          return 'inactive';
      }
    };

    // Sync contacts to local database
    let syncedActiveCount = 0;
    let syncedInactiveCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    let skippedManualOverride = 0;
    const seenCustomers = new Set<string>();

    for (const contact of contacts) {
      try {
        // Additional validation: skip if not a customer
        if (contact.IsCustomer !== true) {
          console.log(`Skipping contact ${contact.Name} - not a customer`);
          skippedCount++;
          continue;
        }

        // Track this customer as seen
        seenCustomers.add(contact.Name.toLowerCase());

        // Check if this customer exists locally and has manual override
        const existingCustomer = localCustomerMap.get(contact.Name.toLowerCase());
        const hasManualOverride = existingCustomer?.manual_status_override === true;

        // If manual override is set, skip updating this customer's status from Xero
        if (hasManualOverride) {
          console.log(`Customer "${contact.Name}" has manual status override, skipping status update`);
          skippedManualOverride++;
          continue;
        }

        // Map Xero contact to our customers table structure
        const customerStatus = getCustomerStatus(contact.ContactStatus);
        const customerData = {
          user_id: user.id,
          name: contact.Name || 'Unknown',
          location: contact.Addresses?.[0]?.City || null,
          mwp_managed: 0, // Default value, can be updated manually
          status: customerStatus,
          join_date: parseXeroDate(contact.UpdatedDateUTC),
          xero_tax_type: contact.AccountsReceivableTaxType || null,
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
          if (customerStatus === 'active') {
            syncedActiveCount++;
          } else {
            syncedInactiveCount++;
          }
        }
      } catch (err) {
        console.error('Error processing contact:', err);
        errorCount++;
      }
    }

    // Mark customers deleted from Xero as inactive
    let markedInactiveCount = 0;
    for (const [customerName, customer] of localCustomerMap) {
      if (!seenCustomers.has(customerName)) {
        // Skip if manual override is enabled
        if (customer.manual_status_override === true) {
          console.log(`Customer "${customer.name}" has manual status override, skipping deletion sync`);
          continue;
        }

        console.log(`Customer "${customer.name}" not found in Xero, marking as inactive`);
        const { error: updateError } = await supabase
          .from('customers')
          .update({ 
            status: 'inactive',
            updated_at: new Date().toISOString()
          })
          .eq('id', customer.id)
          .eq('user_id', user.id);

        if (updateError) {
          console.error(`Error marking customer ${customer.name} as inactive:`, updateError);
          errorCount++;
        } else {
          markedInactiveCount++;
        }
      }
    }

    console.log(`Customer sync complete. Active: ${syncedActiveCount}, Inactive (archived): ${syncedInactiveCount}, Inactive (deleted): ${markedInactiveCount}, Manual override: ${skippedManualOverride}, Errors: ${errorCount}, Skipped: ${skippedCount}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        syncedActive: syncedActiveCount,
        syncedInactive: syncedInactiveCount,
        markedInactive: markedInactiveCount,
        skippedManualOverride,
        errorCount,
        skippedCount,
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
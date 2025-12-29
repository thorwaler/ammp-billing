import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Xero token refresh failed:', errorText);
      throw new Error(`Failed to refresh Xero token: ${tokenResponse.status} ${errorText}`);
    }

    let tokens;
    try {
      const responseText = await tokenResponse.text();
      console.log('Token response status:', tokenResponse.status);
      console.log('Token response content-type:', tokenResponse.headers.get('content-type'));
      console.log('Token response (first 200 chars):', responseText.substring(0, 200));
      tokens = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse token response as JSON:', parseError);
      throw new Error('Xero returned invalid response format. Please reconnect your Xero account in Settings > Integrations.');
    }
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

    let { invoice } = await req.json();
    
    // Get valid access token (from shared connection)
    const { accessToken, tenantId } = await getValidAccessToken(supabase);

    console.log('Attempting to send invoice to Xero for user:', user.id);
    
    // Fetch customer's xero_tax_type from our database
    const contactName = invoice.Contact?.Name;
    if (contactName) {
      const { data: customer } = await supabase
        .from('customers')
        .select('xero_tax_type')
        .eq('name', contactName)
        .single();
      
      // If customer has a tax type configured, apply it to all line items
      if (customer?.xero_tax_type && invoice.LineItems) {
        console.log(`Applying tax type "${customer.xero_tax_type}" to invoice for ${contactName}`);
        invoice = {
          ...invoice,
          LineItems: invoice.LineItems.map((item: any) => ({
            ...item,
            TaxType: customer.xero_tax_type
          }))
        };
      }
    }
    
    console.log('Invoice data:', JSON.stringify(invoice, null, 2));
    
    // Send invoice to Xero
    const xeroResponse = await fetch('https://api.xero.com/api.xro/2.0/Invoices', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Xero-tenant-id': tenantId,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(invoice),
    });

    console.log('Xero response status:', xeroResponse.status);
    console.log('Xero response content-type:', xeroResponse.headers.get('content-type'));

    if (!xeroResponse.ok) {
      const errorText = await xeroResponse.text();
      console.error('Xero API error response:', errorText);
      throw new Error(`Xero API error (${xeroResponse.status}): ${errorText.substring(0, 200)}`);
    }

    let result;
    try {
      const responseText = await xeroResponse.text();
      console.log('Xero success response (first 200 chars):', responseText.substring(0, 200));
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse Xero response as JSON:', parseError);
      throw new Error('Xero returned invalid response format. The invoice may have been created - please check Xero directly.');
    }
    
    console.log('Invoice sent successfully for user:', user.id);

    return new Response(
      JSON.stringify({ success: true, invoice: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in xero-send-invoice:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
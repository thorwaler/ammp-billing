import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const { invoice } = await req.json();
    
    // Get valid access token
    const { accessToken, tenantId } = await getValidAccessToken(supabase, user.id);

    // Send invoice to Xero
    const xeroResponse = await fetch('https://api.xero.com/api.xro/2.0/Invoices', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Xero-tenant-id': tenantId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(invoice),
    });

    if (!xeroResponse.ok) {
      const errorText = await xeroResponse.text();
      console.error('Xero API error:', errorText);
      throw new Error(`Xero API error: ${errorText}`);
    }

    const result = await xeroResponse.json();
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

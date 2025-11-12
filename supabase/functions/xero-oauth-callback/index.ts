import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const { code, state } = await req.json();
    
    console.log('Processing OAuth callback for user:', user.id, 'with state:', state);

    const clientId = Deno.env.get('XERO_CLIENT_ID');
    const clientSecret = Deno.env.get('XERO_CLIENT_SECRET');
    const redirectUri = `${req.headers.get('origin')}/integrations?xero_callback=true`;

    // Exchange code for tokens
    const tokenResponse = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to exchange code for tokens');
    }

    const tokens = await tokenResponse.json();

    // Get tenant connections
    const connectionsResponse = await fetch('https://api.xero.com/connections', {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    const connections = await connectionsResponse.json();
    const tenant = connections[0];

    // Store tokens and tenant info
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    
    const { error: upsertError } = await supabase.from('xero_connections').upsert({
      user_id: user.id,
      tenant_id: tenant.tenantId,
      tenant_name: tenant.tenantName,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
      is_enabled: true,
    }, { onConflict: 'user_id' });

    if (upsertError) {
      console.error('Failed to save Xero connection:', upsertError);
      throw new Error(`Database error: ${upsertError.message}`);
    }

    console.log('Xero OAuth successful for user:', user.id);

    return new Response(
      JSON.stringify({ success: true, tenant: tenant.tenantName }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in xero-oauth-callback:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

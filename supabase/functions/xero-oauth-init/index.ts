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

    const clientId = Deno.env.get('XERO_CLIENT_ID');
    const redirectUri = `${req.headers.get('origin')}/integrations?xero_callback=true`;
    
    // Store state in session to verify callback
    const state = crypto.randomUUID();
    
    // Store state temporarily (you might want to use a more robust solution)
    await supabase.from('xero_connections').upsert({
      user_id: user.id,
      tenant_id: state, // Temporary storage of state
      access_token: '',
      refresh_token: '',
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      is_enabled: false,
    }, { onConflict: 'user_id' });

    const authUrl = `https://login.xero.com/identity/connect/authorize?` +
      `response_type=code&` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=offline_access accounting.transactions accounting.contacts&` +
      `state=${state}`;

    return new Response(
      JSON.stringify({ authUrl, state }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in xero-oauth-init:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

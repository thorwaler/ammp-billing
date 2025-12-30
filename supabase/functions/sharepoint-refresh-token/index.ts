import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const clientId = Deno.env.get('SHAREPOINT_CLIENT_ID')!;
    const clientSecret = Deno.env.get('SHAREPOINT_CLIENT_SECRET')!;
    const tenantId = Deno.env.get('SHAREPOINT_TENANT_ID') || 'common';

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Get existing connection
    const { data: connection, error: connectionError } = await supabase
      .from('sharepoint_connections')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (connectionError || !connection) {
      console.error('No SharePoint connection found:', connectionError);
      return new Response(
        JSON.stringify({ error: 'No SharePoint connection found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Refreshing SharePoint token...');

    // Refresh the token
    const tokenResponse = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: connection.refresh_token,
        grant_type: 'refresh_token',
        scope: 'Sites.ReadWrite.All Files.ReadWrite.All offline_access openid profile',
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('Token refresh error:', tokenData);
      return new Response(
        JSON.stringify({ error: tokenData.error_description || tokenData.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { access_token, refresh_token, expires_in } = tokenData;
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    // Update the connection with new tokens
    const { error: updateError } = await supabase
      .from('sharepoint_connections')
      .update({
        access_token,
        refresh_token: refresh_token || connection.refresh_token,
        expires_at: expiresAt.toISOString(),
      })
      .eq('id', connection.id);

    if (updateError) {
      console.error('Error updating tokens:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update tokens' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('SharePoint token refreshed successfully');

    return new Response(
      JSON.stringify({ success: true, access_token }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error in sharepoint-refresh-token:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

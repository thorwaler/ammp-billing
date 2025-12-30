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

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with user's auth
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Get user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('User authentication error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { code, redirectUri } = await req.json();

    if (!code) {
      return new Response(
        JSON.stringify({ error: 'Authorization code is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Exchanging authorization code for tokens...');

    // Exchange authorization code for tokens
    const tokenResponse = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        scope: 'Sites.ReadWrite.All Files.ReadWrite.All offline_access openid profile',
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('Token exchange error:', tokenData);
      return new Response(
        JSON.stringify({ error: tokenData.error_description || tokenData.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { access_token, refresh_token, expires_in } = tokenData;
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    console.log('Token exchange successful, fetching user profile...');

    // Get user profile info from Microsoft Graph
    let accountName = 'SharePoint Account';
    try {
      const profileResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: {
          'Authorization': `Bearer ${access_token}`,
        },
      });
      if (profileResponse.ok) {
        const profile = await profileResponse.json();
        accountName = profile.displayName || profile.mail || profile.userPrincipalName || 'SharePoint Account';
      }
    } catch (profileError) {
      console.error('Error fetching profile:', profileError);
    }

    // Check for existing connection and upsert
    const { data: existingConnection } = await supabase
      .from('sharepoint_connections')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (existingConnection) {
      // Update existing connection
      const { error: updateError } = await supabase
        .from('sharepoint_connections')
        .update({
          tenant_id: tenantId,
          access_token,
          refresh_token,
          expires_at: expiresAt.toISOString(),
          account_name: accountName,
          is_enabled: true,
        })
        .eq('id', existingConnection.id);

      if (updateError) {
        console.error('Error updating connection:', updateError);
        return new Response(
          JSON.stringify({ error: 'Failed to update connection' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // Create new connection
      const { error: insertError } = await supabase
        .from('sharepoint_connections')
        .insert({
          user_id: user.id,
          tenant_id: tenantId,
          access_token,
          refresh_token,
          expires_at: expiresAt.toISOString(),
          account_name: accountName,
          is_enabled: true,
        });

      if (insertError) {
        console.error('Error inserting connection:', insertError);
        return new Response(
          JSON.stringify({ error: 'Failed to save connection' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log('SharePoint connection saved successfully');

    return new Response(
      JSON.stringify({ success: true, accountName }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error in sharepoint-oauth-callback:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

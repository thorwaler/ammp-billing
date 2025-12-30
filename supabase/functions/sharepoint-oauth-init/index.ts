import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const { redirectUri } = await req.json();
    
    const clientId = Deno.env.get('SHAREPOINT_CLIENT_ID');
    const tenantId = Deno.env.get('SHAREPOINT_TENANT_ID') || 'common';
    
    if (!clientId) {
      console.error('SHAREPOINT_CLIENT_ID not configured');
      return new Response(
        JSON.stringify({ error: 'SharePoint client ID not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate state for CSRF protection
    const state = crypto.randomUUID();
    
    // Build OAuth URL for Microsoft Identity Platform
    const scopes = encodeURIComponent('Sites.ReadWrite.All Files.ReadWrite.All offline_access openid profile');
    const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?` +
      `client_id=${clientId}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_mode=query` +
      `&scope=${scopes}` +
      `&state=${state}`;

    console.log('Generated SharePoint OAuth URL');

    return new Response(
      JSON.stringify({ authUrl, state }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error in sharepoint-oauth-init:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

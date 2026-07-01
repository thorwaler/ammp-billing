import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getValidAccessToken(supabase: any, connection: any) {
  const now = new Date();
  const expiresAt = new Date(connection.expires_at);

  if (expiresAt > new Date(now.getTime() + 5 * 60 * 1000)) {
    return connection.access_token;
  }

  const clientId = Deno.env.get('SHAREPOINT_CLIENT_ID')!;
  const clientSecret = Deno.env.get('SHAREPOINT_CLIENT_SECRET')!;
  const tenantId = Deno.env.get('SHAREPOINT_TENANT_ID') || 'common';

  const tokenResponse = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: connection.refresh_token,
      grant_type: 'refresh_token',
      scope: 'Sites.ReadWrite.All Files.ReadWrite.All offline_access',
    }),
  });

  const tokenData = await tokenResponse.json();
  if (tokenData.error) {
    throw new Error(tokenData.error_description || tokenData.error);
  }

  const newExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
  await supabase
    .from('sharepoint_connections')
    .update({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || connection.refresh_token,
      expires_at: newExpiresAt.toISOString(),
    })
    .eq('id', connection.id);

  return tokenData.access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { driveId, fileId } = await req.json();

    if (!driveId || !fileId) {
      return new Response(
        JSON.stringify({ error: 'driveId and fileId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: connection, error: connectionError } = await supabase
      .from('sharepoint_connections')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (connectionError || !connection) {
      return new Response(
        JSON.stringify({ error: 'No SharePoint connection found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const accessToken = await getValidAccessToken(supabase, connection);

    const deleteUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${fileId}`;
    console.log(`Deleting SharePoint item: ${deleteUrl}`);

    const deleteResponse = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    // 204 = success, 404 = already gone (treat as success)
    if (!deleteResponse.ok && deleteResponse.status !== 404) {
      const errorText = await deleteResponse.text();
      console.error('SharePoint delete error:', deleteResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to delete document', status: deleteResponse.status }),
        { status: deleteResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, alreadyGone: deleteResponse.status === 404 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error in sharepoint-delete-document:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

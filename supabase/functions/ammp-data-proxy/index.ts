import { corsHeaders } from '../_shared/cors.ts';

const AMMP_BASE_URL = 'https://data-api.ammp.io/v1';

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { path, method = 'GET', token } = await req.json();

    if (!path || !token) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: path and token' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const url = `${AMMP_BASE_URL}${path}`;
    console.log(`Proxying ${method} request to: ${url}`);

    const startTime = Date.now();
    const response = await fetch(url, {
      method,
      headers: {
        'accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });
    const duration = Date.now() - startTime;
    console.log(`[AMMP Timing] ${url} took ${duration}ms`);

    const responseText = await response.text();
    
    // Log detailed response information
    console.log(`[AMMP Response] Status: ${response.status}, Path: ${path}`);
    console.log(`[AMMP Response] Content-Type: ${response.headers.get('content-type')}`);
    console.log(`[AMMP Response] Body length: ${responseText.length} bytes`);
    
    // Special logging for device endpoints
    if (path.includes('/devices')) {
      try {
        const parsed = JSON.parse(responseText);
        const deviceCount = Array.isArray(parsed) ? parsed.length : 'not-an-array';
        console.log(`[AMMP Devices] Asset: ${path}, Device count: ${deviceCount}`);
        
        if (Array.isArray(parsed) && parsed.length === 0) {
          console.warn(`[AMMP Devices] Empty device array for: ${path}`);
        } else if (Array.isArray(parsed) && parsed.length > 0) {
          console.log(`[AMMP Devices] Sample device types:`, parsed.slice(0, 3).map(d => d.device_type));
        }
        
        // Log raw response for debugging if it's short enough
        if (responseText.length < 1000) {
          console.log(`[AMMP Raw Response] ${path}:`, responseText);
        }
      } catch (e) {
        console.error(`[AMMP Devices] Failed to parse response:`, e);
      }
    }
    
    if (!response.ok) {
      // Special case: 404 for devices endpoint means no devices exist for this asset
      // This is a valid state, so return empty array instead of error
      if (response.status === 404 && path.includes('/devices')) {
        console.log(`Asset has no devices (404), returning empty array for: ${path}`);
        
        return new Response(
          JSON.stringify([]),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
      
      console.error(`AMMP API error: ${response.status} - ${responseText}`);
      
      return new Response(
        JSON.stringify({
          error: 'AMMP data request failed',
          details: responseText,
          status: response.status,
        }),
        {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`Successfully proxied request to ${url}`);
    
    return new Response(
      responseText,
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in ammp-data-proxy:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

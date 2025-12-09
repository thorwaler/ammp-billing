import { corsHeaders } from '../_shared/cors.ts';

const AMMP_BASE_URL = 'https://data-api.ammp.io/v1';
const REQUEST_TIMEOUT_MS = 25000; // 25 seconds timeout (edge functions have 30s limit)

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

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    const startTime = Date.now();
    
    try {
      response = await fetch(url, {
        method,
        headers: {
          'accept': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        signal: controller.signal,
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      const errorMessage = fetchError instanceof Error ? fetchError.message : 'Unknown fetch error';
      
      // Check if it's an abort/timeout error
      if (errorMessage.includes('abort') || errorMessage.includes('timeout')) {
        console.error(`AMMP API request timed out after ${REQUEST_TIMEOUT_MS}ms: ${url}`);
        return new Response(
          JSON.stringify({
            error: 'AMMP API request timed out',
            details: `Request to ${path} exceeded ${REQUEST_TIMEOUT_MS}ms`,
          }),
          {
            status: 504, // Gateway Timeout
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
      
      console.error(`AMMP API fetch failed: ${errorMessage}`);
      return new Response(
        JSON.stringify({
          error: 'Failed to connect to AMMP API',
          details: errorMessage,
        }),
        {
          status: 502, // Bad Gateway
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
    
    clearTimeout(timeoutId);
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
      // Special case: 404 for /assets/{id}/devices means no devices exist
      // Make fallback call to /assets/{id} to get asset metadata
      if (response.status === 404 && path.startsWith('/assets/') && path.includes('/devices')) {
        console.log(`Asset has no devices (404), fetching asset metadata: ${path}`);
        
        // Extract asset ID and fetch basic asset info
        const assetId = path.split('/')[2];
        const fallbackUrl = `${AMMP_BASE_URL}/assets/${assetId}`;
        
        try {
          const fallbackController = new AbortController();
          const fallbackTimeoutId = setTimeout(() => fallbackController.abort(), REQUEST_TIMEOUT_MS);
          
          const fallbackResponse = await fetch(fallbackUrl, {
            method: 'GET',
            headers: {
              'accept': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            signal: fallbackController.signal,
          });
          
          clearTimeout(fallbackTimeoutId);
          
          if (fallbackResponse.ok) {
            const assetData = await fallbackResponse.json();
            // Return asset with empty devices array
            const assetWithDevices = { ...assetData, devices: [] };
            
            console.log(`Successfully fetched asset metadata for ${assetId}, adding empty devices array`);
            
            return new Response(
              JSON.stringify(assetWithDevices),
              {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              }
            );
          }
        } catch (fallbackError) {
          console.error(`Fallback fetch failed for ${assetId}:`, fallbackError);
        }
        
        // If fallback fails, return minimal structure
        console.warn(`Could not fetch asset metadata for ${assetId}, returning minimal structure`);
        return new Response(
          JSON.stringify({ 
            asset_id: assetId,
            asset_name: 'Unknown Asset',
            devices: [],
            total_pv_power: 0,
          }),
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

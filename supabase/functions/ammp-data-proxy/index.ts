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

    const response = await fetch(url, {
      method,
      headers: {
        'accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    const responseText = await response.text();
    
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

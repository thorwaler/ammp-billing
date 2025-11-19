import { corsHeaders } from '../_shared/cors.ts';

const AMMP_TOKEN_URL = 'https://data-api.ammp.io/v1/token';

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { apiKey } = await req.json();

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'API key is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Exchanging AMMP API key for Bearer token...');

    // Call AMMP token endpoint with API key
    const response = await fetch(AMMP_TOKEN_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'x-api-key': apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AMMP token exchange failed:', response.status, errorText);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to authenticate with AMMP API',
          details: errorText 
        }),
        { 
          status: response.status, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const data = await response.json();
    console.log('AMMP token exchange successful');

    return new Response(
      JSON.stringify({ access_token: data.access_token }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in ammp-token-exchange:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

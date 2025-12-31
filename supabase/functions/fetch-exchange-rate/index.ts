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
    console.log('Fetching live exchange rate from Frankfurter API...');
    
    // Frankfurter API - free, no API key required
    const response = await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR');
    
    if (!response.ok) {
      console.error('Frankfurter API error:', response.status, response.statusText);
      throw new Error(`API responded with status ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Frankfurter API response:', JSON.stringify(data));
    
    const rate = data.rates?.EUR;
    
    if (typeof rate !== 'number') {
      throw new Error('Invalid rate received from API');
    }
    
    console.log('Successfully fetched EUR/USD rate:', rate);
    
    return new Response(
      JSON.stringify({ 
        rate, 
        base: 'USD',
        target: 'EUR',
        date: data.date,
        fetchedAt: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching exchange rate:', errorMessage);
    
    // Return fallback rate on error
    return new Response(
      JSON.stringify({ 
        rate: 0.92, 
        base: 'USD',
        target: 'EUR',
        fallback: true,
        error: errorMessage,
        fetchedAt: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 // Still return 200 with fallback
      }
    );
  }
});

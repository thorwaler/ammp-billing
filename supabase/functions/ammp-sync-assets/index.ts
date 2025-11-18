import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AssetResponse {
  asset_id: string
  asset_name: string
  total_pv_power?: number
}

interface DeviceResponse {
  device_id: string
  device_type: string
  data_provider?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { customer_id } = await req.json()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Fetch customer
    const { data: customer, error: fetchError } = await supabase
      .from('customers')
      .select('ammp_asset_ids')
      .eq('id', customer_id)
      .single()

    if (fetchError) throw fetchError

    const assetIds = customer.ammp_asset_ids as string[] || []
    if (assetIds.length === 0) {
      throw new Error('No AMMP assets linked')
    }

    // Fetch data from AMMP API
    const ammpApiKey = Deno.env.get('AMMP_API_KEY')
    const baseURL = 'https://os.ammp.io/api/v1/data-api/v1'

    const headers: Record<string, string> = {
      'Accept': 'application/json',
    }

    if (ammpApiKey) {
      headers['X-Api-Key'] = ammpApiKey
    }

    // Fetch all assets
    const assetsPromises = assetIds.map(id =>
      fetch(`${baseURL}/assets/${id}`, { headers, credentials: 'include' })
        .then(r => r.json())
    )

    const devicesPromises = assetIds.map(id =>
      fetch(`${baseURL}/assets/${id}/devices`, { headers, credentials: 'include' })
        .then(r => r.json())
    )

    const [assetsData, devicesData] = await Promise.all([
      Promise.all(assetsPromises),
      Promise.all(devicesPromises)
    ])

    // Build capabilities
    const capabilities: Record<string, any> = {}
    let totalMW = 0

    assetsData.forEach((asset: AssetResponse, i) => {
      const devices = devicesData[i] as DeviceResponse[]
      const mw = (asset.total_pv_power || 0) / 1_000_000
      totalMW += mw

      capabilities[asset.asset_id] = {
        assetName: asset.asset_name,
        totalMW: mw,
        hasSolcast: devices.some(d => d.data_provider?.toLowerCase().includes('solcast')),
        hasBattery: devices.some(d => d.device_type?.toLowerCase().includes('battery')),
        hasGenset: devices.some(d => d.device_type?.toLowerCase().includes('genset')),
        deviceCount: devices.length
      }
    })

    // Update customer
    const { error: updateError } = await supabase
      .from('customers')
      .update({
        mwp_managed: totalMW,
        ammp_capabilities: capabilities,
        last_ammp_sync: new Date().toISOString(),
        ammp_sync_status: 'success'
      })
      .eq('id', customer_id)

    if (updateError) throw updateError

    return new Response(JSON.stringify({
      success: true,
      totalMW,
      sitesCount: assetIds.length,
      capabilities
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

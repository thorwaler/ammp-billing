// Monthly cron (15th): backstop for the zero-PV scan that also runs at the end
// of every AMMP contract sync. Shared logic lives in `_shared/zeroPvScan.ts`.
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { runZeroPvScan } from "../_shared/zeroPvScan.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let contractId: string | undefined;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        contractId = body?.contractId;
      } catch {
        // no body — full scan
      }
    }

    const result = await runZeroPvScan(supabase, { contractId });

    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("zero-pv-check error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

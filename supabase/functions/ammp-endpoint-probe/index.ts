// Temporary diagnostic: probe AMMP data endpoints to find the one that serves
// time-series measurements. Not referenced by the app.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { postJsonWithRetry } from "../_shared/internalFetch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE = "https://data-api.ammp.io/v1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const body = await req.json().catch(() => ({}));
    const assetId: string = body.assetId;

    const { data: conn } = await supabase
      .from("ammp_connections")
      .select("api_key")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const tokenData = await postJsonWithRetry(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/ammp-token-exchange`,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { apiKey: conn?.api_key },
      "Token exchange",
      2,
      "ammp-endpoint-probe",
    );
    const token = tokenData.access_token;

    const to = new Date().toISOString().slice(0, 19) + "Z";
    const from = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 19) + "Z";

    const devicesRes = await fetch(`${BASE}/assets/${assetId}/devices?include_virtual=true`, {
      headers: { accept: "application/json", Authorization: `Bearer ${token}` },
    });
    const devicesPayload = await devicesRes.json();
    const devices: any[] = devicesPayload?.devices ?? [];
    const linked = devices.flatMap((d: any) =>
      (d.links ?? []).map((l: any) => ({ device: d.device_name, type: d.device_type, href: l.href, rel: l.rel })),
    );

    const attempts: Array<{ path: string; method: string; body?: unknown }> = [];
    const pv = linked.filter((l: any) => l.rel.includes("pv-inverter")).slice(0, 1);
    for (const l of pv) {
      const rel = String(l.href).split("/v1")[1];
      for (const days of [30, 90, 365]) {
        const f = new Date(Date.now() - days * 864e5).toISOString().slice(0, 19) + "Z";
        attempts.push({ path: `${rel}?date_from=${encodeURIComponent(f)}&date_to=${encodeURIComponent(to)}&interval=15m`, method: "GET" });
      }
    }

    const results: any[] = [];
    for (const a of attempts) {
      try {
        const res = await fetch(`${BASE}${a.path}`, {
          method: a.method,
          headers: {
            accept: "application/json",
            Authorization: `Bearer ${token}`,
            ...(a.body ? { "Content-Type": "application/json" } : {}),
          },
          ...(a.body ? { body: JSON.stringify(a.body) } : {}),
        });
        const text = await res.text();
        results.push({ path: a.path, method: a.method, status: res.status, sample: `len=${text.length} ` + text.slice(0, 200) });
      } catch (e) {
        results.push({ path: a.path, method: a.method, error: String(e) });
      }
    }

    return new Response(JSON.stringify({ ok: true, results }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

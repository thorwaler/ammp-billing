// Daily cron: fetches the latest 6 months of Eurozone HICP annual rate of
// change from the ECB Statistical Data Warehouse and upserts them into
// `inflation_reference_rates`.
//
// ECB series: ICP.M.U2.N.000000.4.ANR  (HICP - Overall index, annual rate of change)
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ECB_URL =
  "https://data-api.ecb.europa.eu/service/data/ICP/M.U2.N.000000.4.ANR?format=jsondata&lastNObservations=6";

interface EcbObservation {
  month: string; // YYYY-MM-DD (first day of month)
  rate_pct: number;
}

async function fetchEcbRates(): Promise<EcbObservation[]> {
  const res = await fetch(ECB_URL);
  if (!res.ok) throw new Error(`ECB responded ${res.status}`);
  const json = await res.json();

  const timePeriods: string[] = (json?.structure?.dimensions?.observation ?? [])
    .find((d: any) => d.id === "TIME_PERIOD")
    ?.values?.map((v: any) => v.id) ?? [];

  const series = json?.dataSets?.[0]?.series ?? {};
  const firstKey = Object.keys(series)[0];
  const observations = series[firstKey]?.observations ?? {};

  const out: EcbObservation[] = [];
  for (const [idx, arr] of Object.entries(observations)) {
    const i = Number(idx);
    const period = timePeriods[i]; // e.g. "2026-05"
    const value = Array.isArray(arr) ? Number((arr as any[])[0]) : NaN;
    if (!period || Number.isNaN(value)) continue;
    out.push({ month: `${period}-01`, rate_pct: value });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const rates = await fetchEcbRates();
    if (rates.length === 0) throw new Error("No observations returned by ECB");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const rows = rates.map((r) => ({ ...r, source: "ecb_hicp" }));
    const { error } = await supabase
      .from("inflation_reference_rates")
      .upsert(rows, { onConflict: "month,source" });
    if (error) throw error;

    return new Response(
      JSON.stringify({ ok: true, upserted: rows.length, latest: rows[rows.length - 1] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("fetch-ecb-inflation error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

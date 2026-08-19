// On-demand sanity check for registered PV capacity.
//
// For every asset in a contract's cached capabilities we pull the peak daily
// PV output over the last 365 days from the AMMP data API, convert it to an
// implied kWp (peak daily kWh / 5 effective sun hours) and compare it to the
// registered capacity. Ratios far below or above 1 mean the registered value
// is unrealistic. Assets that return no data are reported separately — a very
// common case, so they are never treated as failures.
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { fetchAmmpData } from "../_shared/ammpClient.ts";
import { postJsonWithRetry } from "../_shared/internalFetch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOW_RATIO = 0.3;
const HIGH_RATIO = 1.2;
const SUN_HOURS = 5;
const MAX_ASSETS = 250;
const CONCURRENCY = 5;
const TIME_BUDGET_MS = 110_000;

type Verdict = "ok" | "too_low" | "too_high" | "no_data" | "error";

interface AssetVerdict {
  assetId: string;
  assetName: string;
  registeredKWp: number;
  observedKWp: number | null;
  ratio: number | null;
  verdict: Verdict;
  error?: string;
  /** Which metric produced the observed value. */
  source?: "pv_energy_out" | "pv_power" | null;
}

/** Diagnostics captured from the first response of a run. */
interface RunDiag {
  logged: boolean;
  path?: string;
  body?: unknown;
  payloadKeys?: string[];
  sample?: string;
}

async function getToken(apiKey: string): Promise<string> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const data = await postJsonWithRetry(
    `${supabaseUrl}/functions/v1/ammp-token-exchange`,
    serviceKey,
    { apiKey },
    "Token exchange",
    3,
    "ammp-capacity-sanity-check",
  );
  return data.access_token;
}

/**
 * Pull a numeric time series out of whatever shape AMMP returns for a metric.
 * Accepts `{ <metric>: { data: [...] } }`, `{ data: { <metric>: [...] } }`,
 * a bare array, and both `{ date, value }` objects and `[ts, value]` pairs.
 */
function extractSeries(payload: any, metric: string): number[] {
  const candidates: any[] = [
    payload?.[metric]?.data,
    payload?.[metric],
    payload?.data?.[metric]?.data,
    payload?.data?.[metric],
    payload?.series?.[metric],
    Array.isArray(payload?.data) ? payload.data : undefined,
  ];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    const values: number[] = [];
    for (const dp of candidate) {
      if (typeof dp === "number") values.push(dp);
      else if (Array.isArray(dp) && typeof dp[1] === "number") values.push(dp[1]);
      else if (dp && typeof dp === "object") {
        const v = (dp as any).value ?? (dp as any)[metric] ?? (dp as any).v;
        if (typeof v === "number") values.push(v);
      }
    }
    if (values.length > 0) return values;
  }
  return [];
}

function peakOf(values: number[]): number {
  let peak = 0;
  for (const v of values) if (Number.isFinite(v) && v > peak) peak = v;
  return peak;
}

async function fetchMetric(
  token: string,
  assetId: string,
  metric: string,
  interval: string,
  dateFrom: string,
  dateTo: string,
  diag: RunDiag,
): Promise<any> {
  const path = `/assets/${assetId}/data`;
  const body = {
    asset_ids: [assetId],
    fields: [metric],
    metrics: [metric],
    interval,
    date_from: dateFrom,
    date_to: dateTo,
  };
  const payload = await fetchAmmpData(token, path, {
    method: "POST",
    body,
    maxAttempts: 2,
    logTag: "ammp-capacity-sanity-check",
  });

  if (!diag.logged) {
    diag.logged = true;
    diag.path = path;
    diag.body = body;
    diag.payloadKeys = payload && typeof payload === "object" ? Object.keys(payload).slice(0, 20) : [];
    diag.sample = JSON.stringify(payload ?? null).slice(0, 600);
    console.log(
      `[ammp-capacity-sanity-check] first response for ${path} body=${JSON.stringify(body)} keys=${JSON.stringify(
        diag.payloadKeys,
      )} sample=${diag.sample}`,
    );
  }

  return payload;
}

async function checkAsset(
  token: string,
  asset: any,
  dateFrom: string,
  dateTo: string,
  diag: RunDiag,
): Promise<AssetVerdict> {
  const registeredKWp = Number(asset.capacityKWp ?? (asset.totalMW ?? 0) * 1000) || 0;
  const base: AssetVerdict = {
    assetId: String(asset.assetId),
    assetName: asset.assetName ?? String(asset.assetId),
    registeredKWp,
    observedKWp: null,
    ratio: null,
    verdict: "no_data",
    source: null,
  };

  let observedKWp: number | null = null;
  let source: AssetVerdict["source"] = null;

  // 1) Daily energy → implied kWp via effective sun hours.
  try {
    const payload = await fetchMetric(token, asset.assetId, "pv_energy_out", "1d", dateFrom, dateTo, diag);
    const peakKwh = peakOf(extractSeries(payload, "pv_energy_out"));
    if (peakKwh > 0) {
      observedKWp = peakKwh / SUN_HOURS;
      source = "pv_energy_out";
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[ammp-capacity-sanity-check] energy fetch failed for ${asset.assetId}: ${message}`);
    // Fall through to the power metric; only report an error if that fails too.
    base.error = message;
  }

  // 2) Fallback: peak instantaneous PV power is already kW.
  if (observedKWp == null) {
    try {
      const payload = await fetchMetric(token, asset.assetId, "pv_power", "1h", dateFrom, dateTo, diag);
      const peakKw = peakOf(extractSeries(payload, "pv_power"));
      if (peakKw > 0) {
        observedKWp = peakKw;
        source = "pv_power";
        base.error = undefined;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[ammp-capacity-sanity-check] power fetch failed for ${asset.assetId}: ${message}`);
      base.error = base.error ?? message;
    }
  }

  if (observedKWp == null) {
    return { ...base, verdict: base.error ? "error" : "no_data" };
  }

  if (registeredKWp <= 0) {
    return { ...base, error: undefined, observedKWp, source, ratio: null, verdict: "too_low" };
  }

  const ratio = observedKWp / registeredKWp;
  const verdict: Verdict = ratio < LOW_RATIO ? "too_low" : ratio > HIGH_RATIO ? "too_high" : "ok";
  return { ...base, error: undefined, observedKWp, source, ratio, verdict };
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();

  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

    // Auth: user JWT with write permission (browser-initiated action).
    const authHeader = req.headers.get("Authorization");
    const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!bearer) {
      return new Response(JSON.stringify({ error: "User authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let userId: string | null = null;
    if (bearer !== serviceKey) {
      const { data, error } = await supabase.auth.getUser(bearer);
      if (error || !data?.user?.id) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = data.user.id;
      const { data: canWrite } = await supabase.rpc("can_write", { _user_id: userId });
      if (!canWrite) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = await req.json().catch(() => ({}));
    const contractId = typeof body?.contractId === "string" ? body.contractId : null;
    if (!contractId) {
      return new Response(JSON.stringify({ error: "contractId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: contract, error: contractError } = await supabase
      .from("contracts")
      .select("id, user_id, customer_id, company_name, contract_name, cached_capabilities")
      .eq("id", contractId)
      .maybeSingle();

    if (contractError) throw contractError;
    if (!contract) {
      return new Response(JSON.stringify({ error: "Contract not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: ignoredRows } = await supabase.from("ignored_assets").select("asset_id");
    const ignored = new Set((ignoredRows ?? []).map((r: any) => String(r.asset_id)));

    const allAssets: any[] = (contract as any).cached_capabilities?.assetBreakdown ?? [];
    const assets = allAssets
      .filter((a) => a?.assetId && !ignored.has(String(a.assetId)) && a?.isBatteryOnly !== true)
      .slice(0, MAX_ASSETS);

    const dateTo = new Date();
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - 365);
    const from = dateFrom.toISOString().slice(0, 10);
    const to = dateTo.toISOString().slice(0, 10);

    const apiKeyRow = await supabase
      .from("ammp_connections")
      .select("api_key")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const apiKey = apiKeyRow.data?.api_key;
    if (!apiKey) throw new Error("No shared AMMP API key found");
    const token = await getToken(apiKey);

    const results: AssetVerdict[] = [];
    const diag: RunDiag = { logged: false };
    let truncated = false;

    for (let i = 0; i < assets.length; i += CONCURRENCY) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        truncated = true;
        break;
      }
      const batch = assets.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(batch.map((a) => checkAsset(token, a, from, to, diag)));
      results.push(...batchResults);
    }

    const suspicious = results.filter((r) => r.verdict === "too_low" || r.verdict === "too_high");
    const noData = results.filter((r) => r.verdict === "no_data");
    const errors = results.filter((r) => r.verdict === "error");
    const errorSample = Array.from(new Set(errors.map((r) => r.error ?? "unknown error"))).slice(0, 3);
    console.log(
      `[ammp-capacity-sanity-check] contract=${contractId} checked=${results.length} suspicious=${suspicious.length} noData=${noData.length} errors=${errors.length} errorSample=${JSON.stringify(errorSample)}`,
    );


    if (suspicious.length > 0) {
      const assetIds = suspicious.map((r) => r.assetId).sort();
      const { data: existingAlerts } = await supabase
        .from("invoice_alerts")
        .select("id, metadata")
        .eq("contract_id", contract.id)
        .eq("alert_type", "pv_capacity_ratio")
        .eq("is_acknowledged", false);

      const duplicate = (existingAlerts ?? []).some((al: any) => {
        const ids = Array.isArray(al?.metadata?.asset_ids) ? [...al.metadata.asset_ids].sort() : [];
        return ids.length === assetIds.length && ids.every((v, idx) => v === assetIds[idx]);
      });

      if (!duplicate) {
        await supabase.from("invoice_alerts").insert({
          user_id: userId ?? (contract as any).user_id,
          contract_id: contract.id,
          customer_id: (contract as any).customer_id,
          alert_type: "pv_capacity_ratio",
          severity: "warning",
          title: `${suspicious.length} site(s) with unrealistic PV capacity — ${
            (contract as any).contract_name || (contract as any).company_name
          }`,
          description: `Observed peak output does not match the registered capacity (expected ratio between ${LOW_RATIO} and ${HIGH_RATIO}): ${suspicious
            .slice(0, 10)
            .map(
              (r) =>
                `${r.assetName} (${r.registeredKWp.toFixed(1)} kWp registered, ~${(
                  r.observedKWp ?? 0
                ).toFixed(1)} kWp observed)`,
            )
            .join(", ")}.`,
          metadata: {
            asset_ids: assetIds,
            low_ratio: LOW_RATIO,
            high_ratio: HIGH_RATIO,
            assets: suspicious.slice(0, 50).map((r) => ({
              asset_id: r.assetId,
              asset_name: r.assetName,
              registered_kwp: Math.round(r.registeredKWp * 10) / 10,
              observed_kwp: r.observedKWp == null ? null : Math.round(r.observedKWp * 10) / 10,
              ratio: r.ratio == null ? null : Math.round(r.ratio * 100) / 100,
              verdict: r.verdict,
            })),
          },
        });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        checked: results.length,
        totalAssets: assets.length,
        truncated,
        suspiciousCount: suspicious.length,
        noDataCount: noData.length,
        errorCount: errors.length,
        errorSample,
        diagnostics: { payloadKeys: diag.payloadKeys ?? [], sample: diag.sample ?? null },
        results,

      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("ammp-capacity-sanity-check error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

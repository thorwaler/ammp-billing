// On-demand sanity check for registered PV capacity.
//
// AMMP has no asset-level `/data` endpoint (that path 404s). Time series live
// per device: `GET /v1/devices/{device_id}/historic-data/pv-inverter` with
// ISO-8601 `date_from` / `date_to` and a 5m or 15m `interval`. We take the peak
// `pv_inverter_ac_P_total` over a short recent window for every PV inverter of
// an asset, sum the per-device peaks, and compare the implied kWp against the
// registered capacity.
//
// Those responses are megabytes each, so a run handles a slice of the contract's
// assets (`offset` / `limit`) and the caller pages through until `nextOffset` is
// null.
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
const DEFAULT_WINDOW_DAYS = 7;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 40;
const MAX_DEVICES_PER_ASSET = 8;
const CONCURRENCY = 3;
const TIME_BUDGET_MS = 100_000;

type Verdict = "ok" | "too_low" | "too_high" | "no_data" | "error";

interface AssetVerdict {
  assetId: string;
  assetName: string;
  registeredKWp: number;
  observedKWp: number | null;
  ratio: number | null;
  verdict: Verdict;
  error?: string;
  /** How many PV inverters contributed to the observed peak. */
  devices?: number;
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

/** Peak value of `pv_inverter_ac_P_total` (W) across all datasets of a device. */
function peakPowerW(payload: any): number {
  const datasets = payload?.pv_inverter_ac_P_total?.datasets ?? [];
  let peak = 0;
  for (const ds of datasets) {
    for (const dp of ds?.data ?? []) {
      const v = dp?.value;
      if (typeof v === "number" && Number.isFinite(v) && v > peak) peak = v;
    }
  }
  return peak;
}

/** PV inverter device IDs for an asset — cached list first, live fetch as fallback. */
async function pvInverterDeviceIds(token: string, asset: any): Promise<string[]> {
  const cached: any[] = Array.isArray(asset?.devices) ? asset.devices : [];
  const fromCache = cached
    .filter((d) => d?.deviceType === "pv_inverter" && d?.deviceId)
    .map((d) => String(d.deviceId));
  if (fromCache.length > 0) return fromCache.slice(0, MAX_DEVICES_PER_ASSET);

  const payload = await fetchAmmpData(token, `/assets/${asset.assetId}/devices?include_virtual=true`, {
    maxAttempts: 2,
    logTag: "ammp-capacity-sanity-check",
  });
  const devices: any[] = payload?.devices ?? [];
  return devices
    .filter((d) => d?.device_type === "pv_inverter" && d?.device_id)
    .map((d) => String(d.device_id))
    .slice(0, MAX_DEVICES_PER_ASSET);
}

async function checkAsset(
  token: string,
  asset: any,
  dateFrom: string,
  dateTo: string,
  logFirst: { done: boolean },
): Promise<AssetVerdict> {
  const registeredKWp = Number(asset.capacityKWp ?? (asset.totalMW ?? 0) * 1000) || 0;
  const base: AssetVerdict = {
    assetId: String(asset.assetId),
    assetName: asset.assetName ?? String(asset.assetId),
    registeredKWp,
    observedKWp: null,
    ratio: null,
    verdict: "no_data",
  };

  let deviceIds: string[];
  try {
    deviceIds = await pvInverterDeviceIds(token, asset);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ...base, verdict: "error", error: message };
  }

  if (deviceIds.length === 0) return { ...base, verdict: "no_data", devices: 0 };

  let totalPeakW = 0;
  let contributing = 0;
  let lastError: string | undefined;

  for (const deviceId of deviceIds) {
    const path = `/devices/${deviceId}/historic-data/pv-inverter?date_from=${encodeURIComponent(
      dateFrom,
    )}&date_to=${encodeURIComponent(dateTo)}&interval=15m`;
    try {
      const payload = await fetchAmmpData(token, path, {
        maxAttempts: 2,
        logTag: "ammp-capacity-sanity-check",
      });
      if (!logFirst.done) {
        logFirst.done = true;
        console.log(
          `[ammp-capacity-sanity-check] first device response ${path} keys=${JSON.stringify(
            Object.keys(payload ?? {}).slice(0, 25),
          )} datasets=${payload?.pv_inverter_ac_P_total?.datasets?.length ?? 0}`,
        );
      }
      const peak = peakPowerW(payload);
      if (peak > 0) {
        totalPeakW += peak;
        contributing++;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(`[ammp-capacity-sanity-check] ${path} failed: ${lastError}`);
    }
  }

  if (totalPeakW <= 0) {
    return {
      ...base,
      devices: deviceIds.length,
      verdict: lastError ? "error" : "no_data",
      error: lastError,
    };
  }

  const observedKWp = totalPeakW / 1000;
  if (registeredKWp <= 0) {
    return { ...base, devices: contributing, observedKWp, ratio: null, verdict: "too_low" };
  }

  const ratio = observedKWp / registeredKWp;
  const verdict: Verdict = ratio < LOW_RATIO ? "too_low" : ratio > HIGH_RATIO ? "too_high" : "ok";
  return { ...base, devices: contributing, observedKWp, ratio, verdict };
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
    const offset = Number.isFinite(body?.offset) ? Math.max(0, Math.floor(body.offset)) : 0;
    const limit = Number.isFinite(body?.limit)
      ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(body.limit)))
      : DEFAULT_LIMIT;
    const windowDays = Number.isFinite(body?.windowDays)
      ? Math.min(30, Math.max(1, Math.floor(body.windowDays)))
      : DEFAULT_WINDOW_DAYS;

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

    const allAssets: any[] = ((contract as any).cached_capabilities?.assetBreakdown ?? []).filter(
      (a: any) => a?.assetId && !ignored.has(String(a.assetId)) && a?.isBatteryOnly !== true,
    );
    const assets = allAssets.slice(offset, offset + limit);

    const dateTo = new Date().toISOString().slice(0, 19) + "Z";
    const dateFrom = new Date(Date.now() - windowDays * 86_400_000).toISOString().slice(0, 19) + "Z";

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
    const logFirst = { done: false };
    let truncated = false;

    for (let i = 0; i < assets.length; i += CONCURRENCY) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        truncated = true;
        break;
      }
      const batch = assets.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map((a) => checkAsset(token, a, dateFrom, dateTo, logFirst)),
      );
      results.push(...batchResults);
    }

    const suspicious = results.filter((r) => r.verdict === "too_low" || r.verdict === "too_high");
    const noData = results.filter((r) => r.verdict === "no_data");
    const errors = results.filter((r) => r.verdict === "error");
    const errorSample = Array.from(new Set(errors.map((r) => r.error ?? "unknown error"))).slice(0, 3);
    const processed = offset + results.length;
    const nextOffset = processed < allAssets.length ? processed : null;

    console.log(
      `[ammp-capacity-sanity-check] contract=${contractId} offset=${offset} checked=${results.length}/${allAssets.length} suspicious=${suspicious.length} noData=${noData.length} errors=${errors.length} sample=${JSON.stringify(errorSample)}`,
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
          description: `Observed peak output over the last ${windowDays} days does not match the registered capacity (expected ratio between ${LOW_RATIO} and ${HIGH_RATIO}): ${suspicious
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
            window_days: windowDays,
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
        totalAssets: allAssets.length,
        offset,
        nextOffset,
        windowDays,
        truncated,
        suspiciousCount: suspicious.length,
        noDataCount: noData.length,
        errorCount: errors.length,
        errorSample,
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

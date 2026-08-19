// Historic PV power series for a single asset, for the asset-breakdown viewer.
//
// AMMP has no asset-level `/data` endpoint. Series live per device:
// `GET /v1/devices/{device_id}/historic-data/pv-inverter` with ISO-8601
// `date_from` / `date_to` and a 5m/15m `interval`. We fetch every PV inverter of
// the asset, align points on timestamp, sum across devices and downsample before
// returning (raw responses are megabytes).
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { fetchAmmpData } from "../_shared/ammpClient.ts";
import { postJsonWithRetry } from "../_shared/internalFetch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_DEVICES_PER_ASSET = 8;
const MAX_POINTS = 500;
const DEFAULT_WINDOW_DAYS = 7;
const ALLOWED_WINDOWS = [7, 30, 90];

async function getToken(apiKey: string): Promise<string> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const data = await postJsonWithRetry(
    `${supabaseUrl}/functions/v1/ammp-token-exchange`,
    serviceKey,
    { apiKey },
    "Token exchange",
    3,
    "ammp-asset-historic-data",
  );
  return data.access_token;
}

interface DeviceRef {
  deviceId: string;
  deviceName: string;
}

/** PV inverter devices for an asset — cached list first, live fetch as fallback. */
async function pvInverterDevices(token: string, asset: any, assetId: string): Promise<DeviceRef[]> {
  const cached: any[] = Array.isArray(asset?.devices) ? asset.devices : [];
  const fromCache = cached
    .filter((d) => d?.deviceType === "pv_inverter" && d?.deviceId)
    .map((d) => ({ deviceId: String(d.deviceId), deviceName: String(d.deviceName ?? d.deviceId) }));
  if (fromCache.length > 0) return fromCache.slice(0, MAX_DEVICES_PER_ASSET);

  const payload = await fetchAmmpData(token, `/assets/${assetId}/devices?include_virtual=true`, {
    maxAttempts: 2,
    logTag: "ammp-asset-historic-data",
  });
  const devices: any[] = payload?.devices ?? [];
  return devices
    .filter((d) => d?.device_type === "pv_inverter" && d?.device_id)
    .map((d) => ({ deviceId: String(d.device_id), deviceName: String(d.device_name ?? d.device_id) }))
    .slice(0, MAX_DEVICES_PER_ASSET);
}

/** Flatten `pv_inverter_ac_P_total` datasets into [timestampMs, watts] pairs. */
function extractSeries(payload: any): Array<[number, number]> {
  const datasets = payload?.pv_inverter_ac_P_total?.datasets ?? [];
  const byTs = new Map<number, number>();
  for (const ds of datasets) {
    for (const dp of ds?.data ?? []) {
      const raw = dp?.date ?? dp?.timestamp ?? dp?.time ?? (Array.isArray(dp) ? dp[0] : null);
      const value = typeof dp?.value === "number" ? dp.value : Array.isArray(dp) ? Number(dp[1]) : NaN;
      if (raw == null || !Number.isFinite(value)) continue;
      const ts = typeof raw === "number" ? raw : Date.parse(String(raw));
      if (!Number.isFinite(ts)) continue;
      const prev = byTs.get(ts);
      if (prev == null || value > prev) byTs.set(ts, value);
    }
  }
  return [...byTs.entries()].sort((a, b) => a[0] - b[0]);
}

/** Bucketed max downsample to at most MAX_POINTS points. */
function downsample(points: Array<[number, number]>): Array<{ t: number; kW: number }> {
  if (points.length <= MAX_POINTS) {
    return points.map(([t, w]) => ({ t, kW: Math.round((w / 1000) * 1000) / 1000 }));
  }
  const first = points[0][0];
  const last = points[points.length - 1][0];
  const span = Math.max(1, last - first);
  const bucketMs = span / MAX_POINTS;
  const buckets = new Map<number, { t: number; w: number }>();
  for (const [t, w] of points) {
    const key = Math.floor((t - first) / bucketMs);
    const existing = buckets.get(key);
    if (!existing || w > existing.w) buckets.set(key, { t, w });
  }
  return [...buckets.values()]
    .sort((a, b) => a.t - b.t)
    .map(({ t, w }) => ({ t, kW: Math.round((w / 1000) * 1000) / 1000 }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

    const authHeader = req.headers.get("Authorization");
    const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!bearer) {
      return new Response(JSON.stringify({ error: "User authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (bearer !== serviceKey) {
      const { data, error } = await supabase.auth.getUser(bearer);
      if (error || !data?.user?.id) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: canWrite } = await supabase.rpc("can_write", { _user_id: data.user.id });
      if (!canWrite) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = await req.json().catch(() => ({}));
    const contractId = typeof body?.contractId === "string" ? body.contractId : null;
    const assetId = typeof body?.assetId === "string" ? body.assetId : null;
    if (!contractId || !assetId) {
      return new Response(JSON.stringify({ error: "contractId and assetId are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const windowDays = ALLOWED_WINDOWS.includes(Number(body?.windowDays))
      ? Number(body.windowDays)
      : DEFAULT_WINDOW_DAYS;
    const interval = windowDays > 7 ? "1h" : "15m";

    const { data: contract, error: contractError } = await supabase
      .from("contracts")
      .select("id, cached_capabilities")
      .eq("id", contractId)
      .maybeSingle();
    if (contractError) throw contractError;
    if (!contract) {
      return new Response(JSON.stringify({ error: "Contract not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const asset = ((contract as any).cached_capabilities?.assetBreakdown ?? []).find(
      (a: any) => String(a?.assetId) === assetId,
    );
    const registeredKWp = Number(asset?.capacityKWp ?? (asset?.totalMW ?? 0) * 1000) || 0;

    const apiKeyRow = await supabase
      .from("ammp_connections")
      .select("api_key")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const apiKey = apiKeyRow.data?.api_key;
    if (!apiKey) throw new Error("No shared AMMP API key found");
    const token = await getToken(apiKey);

    const devices = await pvInverterDevices(token, asset, assetId);
    if (devices.length === 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          assetId,
          assetName: asset?.assetName ?? assetId,
          windowDays,
          registeredKWp,
          peakKW: null,
          ratio: null,
          points: [],
          perDevice: [],
          isBatteryOnly: asset?.isBatteryOnly === true,
          batteryCapacityKWh: asset?.batteryCapacityKWh ?? null,
          reason: "no_pv_inverters",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const dateTo = new Date().toISOString().slice(0, 19) + "Z";
    const dateFrom = new Date(Date.now() - windowDays * 86_400_000).toISOString().slice(0, 19) + "Z";

    const combined = new Map<number, number>();
    const perDevice: Array<{
      deviceId: string;
      deviceName: string;
      peakKW: number | null;
      points: number;
      error?: string;
    }> = [];
    let lastError: string | undefined;

    for (const device of devices) {
      const path = `/devices/${device.deviceId}/historic-data/pv-inverter?date_from=${encodeURIComponent(
        dateFrom,
      )}&date_to=${encodeURIComponent(dateTo)}&interval=${interval}`;
      try {
        const payload = await fetchAmmpData(token, path, {
          maxAttempts: 2,
          logTag: "ammp-asset-historic-data",
        });
        const series = extractSeries(payload);
        let peak = 0;
        for (const [t, w] of series) {
          if (w > peak) peak = w;
          combined.set(t, (combined.get(t) ?? 0) + w);
        }
        perDevice.push({
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          peakKW: series.length > 0 ? Math.round((peak / 1000) * 100) / 100 : null,
          points: series.length,
        });
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        perDevice.push({
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          peakKW: null,
          points: 0,
          error: lastError,
        });
      }
    }

    const merged = [...combined.entries()].sort((a, b) => a[0] - b[0]);
    const points = downsample(merged);
    const peakW = merged.reduce((max, [, w]) => (w > max ? w : max), 0);
    const peakKW = merged.length > 0 ? Math.round((peakW / 1000) * 100) / 100 : null;
    const ratio = peakKW != null && registeredKWp > 0 ? Math.round((peakKW / registeredKWp) * 100) / 100 : null;

    console.log(
      `[ammp-asset-historic-data] asset=${assetId} window=${windowDays}d devices=${devices.length} points=${points.length} peakKW=${peakKW}`,
    );

    return new Response(
      JSON.stringify({
        ok: true,
        assetId,
        assetName: asset?.assetName ?? assetId,
        windowDays,
        interval,
        registeredKWp,
        peakKW,
        ratio,
        points,
        perDevice,
        isBatteryOnly: asset?.isBatteryOnly === true,
        batteryCapacityKWh: asset?.batteryCapacityKWh ?? null,
        reason: merged.length === 0 ? (lastError ? "error" : "no_data") : null,
        error: merged.length === 0 ? lastError : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("ammp-asset-historic-data error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

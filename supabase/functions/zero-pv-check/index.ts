// Monthly cron (15th): scans contracts with `zero_pv_alert_enabled = true`
// for assets reporting `totalMW = 0` in `cached_capabilities.assets`.
// - Opens a `zero_pv_incidents` row per newly-detected asset (idempotent via
//   the partial unique index on open rows).
// - Resolves incidents whose asset now reports non-zero capacity.
// - Raises an `invoice_alerts` warning per contract with any newly-detected
//   or unresolved zero-PV assets past the alert threshold.
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

    const { data: contracts, error } = await supabase
      .from("contracts")
      .select(
        "id, user_id, customer_id, company_name, contract_name, zero_pv_grace_days, cached_capabilities"
      )
      .eq("zero_pv_alert_enabled", true);
    if (error) throw error;

    let openedCount = 0;
    let resolvedCount = 0;
    let alertsRaised = 0;

    for (const c of contracts ?? []) {
      const assets: any[] =
        c.cached_capabilities?.assetBreakdown ?? c.cached_capabilities?.assets ?? [];
      const zeroAssets = assets.filter((a) => Number(a?.totalMW ?? 0) === 0 && a?.assetId);
      const nonZeroIds = new Set(
        assets.filter((a) => Number(a?.totalMW ?? 0) > 0 && a?.assetId).map((a) => a.assetId)
      );

      // Resolve incidents that now have non-zero capacity.
      const { data: openIncidents } = await supabase
        .from("zero_pv_incidents")
        .select("id, asset_id")
        .eq("contract_id", c.id)
        .is("resolved_at", null);

      for (const inc of openIncidents ?? []) {
        if (nonZeroIds.has(inc.asset_id)) {
          await supabase
            .from("zero_pv_incidents")
            .update({ resolved_at: new Date().toISOString() })
            .eq("id", inc.id);
          resolvedCount++;
        }
      }

      // Open incidents for newly-zero assets (unique index makes this idempotent).
      const newlyDetected: any[] = [];
      for (const a of zeroAssets) {
        const { data: existing } = await supabase
          .from("zero_pv_incidents")
          .select("id")
          .eq("contract_id", c.id)
          .eq("asset_id", a.assetId)
          .is("resolved_at", null)
          .maybeSingle();
        if (existing) continue;
        const { error: insErr } = await supabase.from("zero_pv_incidents").insert({
          user_id: c.user_id,
          contract_id: c.id,
          asset_id: a.assetId,
          asset_name: a.assetName ?? a.assetId,
        });
        if (!insErr) {
          openedCount++;
          newlyDetected.push(a);
        }
      }

      if (zeroAssets.length > 0) {
        const graceDays = Number(c.zero_pv_grace_days ?? 30);
        await supabase.from("invoice_alerts").insert({
          user_id: c.user_id,
          contract_id: c.id,
          customer_id: c.customer_id,
          alert_type: "zero_pv_capacity",
          severity: "warning",
          title: `${zeroAssets.length} asset(s) report 0 PV capacity — ${
            c.contract_name || c.company_name
          }`,
          description: `Assets: ${zeroAssets
            .slice(0, 10)
            .map((a) => a.assetName ?? a.assetId)
            .join(
              ", "
            )}. If unresolved within ${graceDays} days, an estimated capacity (peak PV output ×1.2) will be substituted at invoicing.`,
          metadata: {
            asset_ids: zeroAssets.map((a) => a.assetId),
            grace_days: graceDays,
            newly_detected: newlyDetected.length,
          },
        });
        alertsRaised++;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, openedCount, resolvedCount, alertsRaised }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("zero-pv-check error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

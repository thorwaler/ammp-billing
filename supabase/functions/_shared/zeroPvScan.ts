// Shared zero-PV detection used by the monthly `zero-pv-check` cron and by
// `ammp-sync-contract` (so alerts appear right after a sync, not on the 15th).
//
// - Opens a `zero_pv_incidents` row per newly-detected zero-capacity asset.
// - Resolves incidents whose asset now reports non-zero capacity.
// - Raises one `zero_pv_capacity` alert per contract, skipping insertion when
//   an unacknowledged alert already covers the same asset set.

interface ContractRow {
  id: string;
  user_id: string;
  customer_id: string;
  company_name: string;
  contract_name: string | null;
  zero_pv_grace_days: number | null;
  cached_capabilities: any;
}

export interface ZeroPvScanResult {
  openedCount: number;
  resolvedCount: number;
  alertsRaised: number;
  contractsScanned: number;
}

export async function runZeroPvScan(
  supabase: any,
  opts: { contractId?: string } = {}
): Promise<ZeroPvScanResult> {
  let query = supabase
    .from("contracts")
    .select(
      "id, user_id, customer_id, company_name, contract_name, zero_pv_grace_days, cached_capabilities"
    )
    .eq("zero_pv_alert_enabled", true);

  if (opts.contractId) query = query.eq("id", opts.contractId);

  const { data: contracts, error } = await query;
  if (error) throw error;

  const result: ZeroPvScanResult = {
    openedCount: 0,
    resolvedCount: 0,
    alertsRaised: 0,
    contractsScanned: (contracts ?? []).length,
  };

  // Assets marked as not relevant ("zombie" sites) never raise zero-PV alerts.
  const { data: ignoredRows } = await supabase.from("ignored_assets").select("asset_id");
  const ignored = new Set((ignoredRows ?? []).map((r: any) => String(r.asset_id)));

  for (const c of (contracts ?? []) as ContractRow[]) {
    const assets: any[] =
      c.cached_capabilities?.assetBreakdown ?? c.cached_capabilities?.assets ?? [];
    const zeroAssets = assets.filter(
      (a) => Number(a?.totalMW ?? 0) === 0 && a?.assetId && !ignored.has(String(a.assetId))
    );
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
      if (nonZeroIds.has(inc.asset_id) || ignored.has(String(inc.asset_id))) {
        await supabase
          .from("zero_pv_incidents")
          .update({ resolved_at: new Date().toISOString() })
          .eq("id", inc.id);
        result.resolvedCount++;
      }
    }

    const openIds = new Set((openIncidents ?? []).map((i: any) => i.asset_id));

    // Open incidents for newly-zero assets.
    const newlyDetected: any[] = [];
    for (const a of zeroAssets) {
      if (openIds.has(a.assetId)) continue;
      const { error: insErr } = await supabase.from("zero_pv_incidents").insert({
        user_id: c.user_id,
        contract_id: c.id,
        asset_id: a.assetId,
        asset_name: a.assetName ?? a.assetId,
      });
      if (!insErr) {
        result.openedCount++;
        newlyDetected.push(a);
      }
    }

    if (zeroAssets.length === 0) continue;

    const assetIds = zeroAssets.map((a) => a.assetId).sort();

    // Skip if an unacknowledged alert already covers exactly these assets.
    const { data: existingAlerts } = await supabase
      .from("invoice_alerts")
      .select("id, metadata")
      .eq("contract_id", c.id)
      .eq("alert_type", "zero_pv_capacity")
      .eq("is_acknowledged", false);

    const duplicate = (existingAlerts ?? []).some((al: any) => {
      const ids = Array.isArray(al?.metadata?.asset_ids)
        ? [...al.metadata.asset_ids].sort()
        : [];
      return ids.length === assetIds.length && ids.every((v, i) => v === assetIds[i]);
    });
    if (duplicate) continue;

    const graceDays = Number(c.zero_pv_grace_days ?? 30);
    const { error: alertErr } = await supabase.from("invoice_alerts").insert({
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
        asset_ids: assetIds,
        grace_days: graceDays,
        newly_detected: newlyDetected.length,
      },
    });
    if (!alertErr) result.alertsRaised++;
  }

  return result;
}

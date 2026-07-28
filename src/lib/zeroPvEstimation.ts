/**
 * Zero-PV capacity estimation.
 *
 * When an asset reports `total_pv_power = 0` and Elum hasn't fixed the source
 * data within the contract's grace period, we substitute an estimated
 * capacity when invoicing. The estimate = peak daily kWh over the last 365d
 * converted to instantaneous kWp, multiplied by the contract's configured
 * multiplier (default 1.2).
 *
 * Values are cached on the `zero_pv_incidents` row so we don't hit AMMP
 * repeatedly for the same asset.
 */
import { supabase } from "@/integrations/supabase/client";

export interface ZeroPvEstimate {
  assetId: string;
  estimatedCapacityMW: number;
  source: "ammp_max_pv_output_365d" | "manual" | "cached";
}

export interface ZeroPvIncidentRow {
  id: string;
  contract_id: string;
  asset_id: string;
  asset_name: string;
  detected_at: string;
  resolved_at: string | null;
  estimated_capacity_mw: number | null;
  estimate_source: string | null;
}

/**
 * Returns true when a zero-PV incident has aged past its grace window and the
 * substitute estimate should be used at invoice time.
 */
export function isPastGrace(detectedAt: string, graceDays: number, now: Date = new Date()): boolean {
  const detected = new Date(detectedAt);
  const ageMs = now.getTime() - detected.getTime();
  return ageMs >= graceDays * 24 * 60 * 60 * 1000;
}

/**
 * Fetch peak daily pv_energy_out over the last 365 days via the AMMP data
 * proxy edge function and convert to instantaneous kWp using a 5-hour
 * effective sun-hour heuristic.
 */
export async function computeEstimateFromAmmp(
  assetId: string,
  multiplier: number
): Promise<number | null> {
  const dateTo = new Date();
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - 365);

  const { data, error } = await supabase.functions.invoke("ammp-data-proxy", {
    body: {
      path: `/assets/${assetId}/data`,
      method: "POST",
      body: {
        asset_ids: [assetId],
        interval: "1d",
        date_from: dateFrom.toISOString().slice(0, 10),
        date_to: dateTo.toISOString().slice(0, 10),
      },
    },
  });

  if (error || !data) return null;

  // pv_energy_out.data = [{ date, value }] in kWh
  const series = (data as any)?.pv_energy_out?.data ?? [];
  let peakKwh = 0;
  for (const dp of series) {
    if (typeof dp?.value === "number" && dp.value > peakKwh) peakKwh = dp.value;
  }
  if (peakKwh <= 0) return null;

  // kWh in one day / effective 5 peak-sun-hours → instantaneous kWp
  const kwp = peakKwh / 5;
  const mwp = (kwp / 1000) * (multiplier || 1.2);
  return Math.round(mwp * 1000) / 1000;
}

/**
 * Load or compute an estimate for a specific open incident. Persists the
 * value on the incident row for reuse.
 */
export async function getIncidentEstimateMW(
  incident: ZeroPvIncidentRow,
  multiplier: number
): Promise<number | null> {
  if (incident.estimated_capacity_mw != null) return incident.estimated_capacity_mw;

  const estimate = await computeEstimateFromAmmp(incident.asset_id, multiplier);
  if (estimate == null) return null;

  await supabase
    .from("zero_pv_incidents" as any)
    .update({
      estimated_capacity_mw: estimate,
      estimate_source: "ammp_max_pv_output_365d",
    })
    .eq("id", incident.id);

  return estimate;
}

/**
 * Return open zero-PV incidents for a contract.
 */
export async function getOpenIncidents(contractId: string): Promise<ZeroPvIncidentRow[]> {
  const { data, error } = await supabase
    .from("zero_pv_incidents" as any)
    .select("*")
    .eq("contract_id", contractId)
    .is("resolved_at", null);
  if (error) return [];
  return (data as any) ?? [];
}

/**
 * Manual capacity overrides for the revision dialog, including taking the
 * battery inverter rating over as the billed capacity for still-zero sites.
 */

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { SnapshotDiff, StillZeroAsset } from "@/lib/invoiceRevision";
import type { PerContractDiff } from "./useRevisionData";

interface Args {
  diff: SnapshotDiff | null;
  perContractDiff: PerContractDiff[];
  /** Reloads live contract data after AMMP enrichment. */
  reloadLiveData: () => Promise<unknown>;
}

export function useManualCorrections({ diff, perContractDiff, reloadLiveData }: Args) {
  const [manualInputs, setManualInputs] = useState<Record<string, string>>({});
  /** Asset ids whose manual value was filled from the battery inverter rating. */
  const [batterySourced, setBatterySourced] = useState<Set<string>>(new Set());
  const [fetchingBattery, setFetchingBattery] = useState(false);
  const [batteryFetched, setBatteryFetched] = useState(false);

  /** Which unit an operator-entered number is expressed in, per asset. */
  const metricById = useMemo(() => {
    const m = new Map<string, "mw" | "kva">();
    for (const c of diff?.corrections || []) m.set(c.assetId, c.metric);
    for (const z of diff?.stillZero || []) m.set(z.assetId, z.metric);
    return m;
  }, [diff]);

  const manualOverrides = useMemo(() => {
    const out: Record<string, { mw?: number; kva?: number; source?: "manual" | "battery" }> = {};
    for (const [assetId, raw] of Object.entries(manualInputs)) {
      const value = Number(String(raw).replace(",", "."));
      if (!raw?.trim() || !Number.isFinite(value) || value < 0) continue;
      const source = batterySourced.has(assetId) ? "battery" : "manual";
      out[assetId] = metricById.get(assetId) === "kva" ? { kva: value, source } : { mw: value, source };
    }
    return out;
  }, [manualInputs, metricById, batterySourced]);

  const manualCount = Object.keys(manualOverrides).length;
  const batteryCount = Object.keys(manualOverrides).filter((id) => batterySourced.has(id)).length;

  const setManual = useCallback((assetId: string, value: string) => {
    setManualInputs((prev) => ({ ...prev, [assetId]: value }));
    // Typing over a battery-filled value makes it a hand-entered value again.
    setBatterySourced((prev) => {
      if (!prev.has(assetId)) return prev;
      const next = new Set(prev);
      next.delete(assetId);
      return next;
    });
  }, []);

  const clearManual = useCallback(() => {
    setManualInputs({});
    setBatterySourced(new Set());
  }, []);

  const reset = useCallback(() => {
    setManualInputs({});
    setBatterySourced(new Set());
    setBatteryFetched(false);
  }, []);

  /** Battery inverter rating (kW) usable as a capacity for a still-zero site. */
  const batteryKWFor = useCallback((z: StillZeroAsset): number | null => {
    if (z.metric !== "mw") return null;
    const kw = z.batteryInverterKW;
    return kw != null && Number.isFinite(Number(kw)) && Number(kw) > 0 ? Number(kw) : null;
  }, []);

  const useBatteryValue = useCallback(
    (z: StillZeroAsset) => {
      const kw = batteryKWFor(z);
      if (kw == null) return;
      setManualInputs((prev) => ({ ...prev, [z.assetId]: String(Number((kw / 1000).toFixed(6))) }));
      setBatterySourced((prev) => new Set(prev).add(z.assetId));
    },
    [batteryKWFor],
  );

  const batteryEligible = useMemo(
    () => (diff?.stillZero || []).filter((z) => batteryKWFor(z) != null),
    [diff, batteryKWFor],
  );

  const useBatteryForAll = useCallback(() => {
    if (batteryEligible.length === 0) return;
    setManualInputs((prev) => {
      const next = { ...prev };
      for (const z of batteryEligible) next[z.assetId] = String(Number((batteryKWFor(z)! / 1000).toFixed(6)));
      return next;
    });
    setBatterySourced((prev) => {
      const next = new Set(prev);
      for (const z of batteryEligible) next.add(z.assetId);
      return next;
    });
  }, [batteryEligible, batteryKWFor]);

  /**
   * Battery inverter ratings live in AMMP's `asset_specific_params`, which only
   * the single-asset endpoints return — org-resolved contracts never see them.
   * This pulls them for the still-zero sites only, then reloads the diff.
   */
  const fetchBatteryData = useCallback(async () => {
    const targets = perContractDiff
      .map((p) => ({ contractId: p.contractId, ids: p.diff.stillZero.map((z) => z.assetId) }))
      .filter((t) => t.ids.length > 0);
    if (targets.length === 0) return;

    setFetchingBattery(true);
    try {
      await Promise.all(
        targets.map((t) =>
          supabase.functions.invoke("ammp-device-enrichment", {
            body: { contractId: t.contractId, assetIds: t.ids, batchSize: t.ids.length },
          }),
        ),
      );
      await reloadLiveData();
      setBatteryFetched(true);
      toast.success("Battery data refreshed for the zero-capacity sites");
    } catch (e) {
      console.error("[Revision] Battery data fetch failed:", e);
      toast.error("Could not fetch battery data from AMMP");
    } finally {
      setFetchingBattery(false);
    }
  }, [perContractDiff, reloadLiveData]);

  return {
    manualInputs,
    manualOverrides,
    manualCount,
    batteryCount,
    batterySourced,
    setManual,
    clearManual,
    reset,
    batteryKWFor,
    batteryEligible,
    useBatteryValue,
    useBatteryForAll,
    fetchBatteryData,
    fetchingBattery,
    batteryFetched,
  };
}

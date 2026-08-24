/**
 * Data + diff state for the invoice revision dialog.
 *
 * Loads the current (live) asset data for every contract on the invoice, diffs
 * it against the frozen snapshot per contract, and aggregates the diffs. The
 * same load path is reused by "Fetch battery data" via `reloadLiveData`, so
 * there is only one place that knows how live data is resolved.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  diffSnapshotAgainstLive,
  fetchLiveContractData,
  revisionUnits,
  verifySnapshotReproduces,
  type LiveAsset,
  type SnapshotDiff,
} from "@/lib/invoiceRevision";
import type { InvoiceInputSnapshot } from "@/lib/invoiceSnapshot";

export interface LiveContractData {
  assets: LiveAsset[];
  orgBreakdown?: any[];
  contract?: any;
  contractType?: any;
}

export interface PerContractDiff {
  contractId: string;
  contractName?: string;
  diff: SnapshotDiff;
  snapshotOrgs: number;
  liveOrgs: number;
}

interface Args {
  open: boolean;
  invoice: { id: string; contract_id: string | null; invoice_date: string; billing_frequency: string; xero_invoice_id: string | null } | null;
  snapshot: InvoiceInputSnapshot | null;
  ignoredIds: Set<string>;
  /** Called after a fresh (dialog-open) load so the dialog can reset its own state. */
  onFreshLoad?: (primary: LiveContractData | undefined) => void;
}

export function useRevisionData({ open, invoice, snapshot, ignoredIds, onFreshLoad }: Args) {
  const ignoredKey = useMemo(() => [...ignoredIds].sort().join(","), [ignoredIds]);
  const diffInitialisedFor = useRef<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [liveByContract, setLiveByContract] = useState<Record<string, LiveContractData>>({});
  const [contractRow, setContractRow] = useState<any>(null);
  const [contractType, setContractType] = useState<any>(null);
  const [diff, setDiff] = useState<SnapshotDiff | null>(null);
  const [perContractDiff, setPerContractDiff] = useState<PerContractDiff[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [fidelity, setFidelity] = useState<
    { ok: boolean; recomputed: number; frozen: number; reproducible: boolean; reason?: string } | null
  >(null);

  const units = useMemo(() => (snapshot ? revisionUnits(snapshot) : []), [snapshot]);

  /** Fetch live data for every contract on the invoice and store it. */
  const reloadLiveData = useCallback(async (): Promise<Record<string, LiveContractData>> => {
    const loaded = await Promise.all(
      units.map(async (u) => [u.contractId, await fetchLiveContractData(u.contractId)] as const),
    );
    const map: Record<string, LiveContractData> = {};
    for (const [id, live] of loaded) {
      map[id] = {
        assets: live.assets,
        orgBreakdown: live.orgBreakdown,
        contract: live.contract,
        contractType: live.contractType,
      };
    }
    setLiveByContract(map);
    return map;
  }, [units]);

  // Initial load when the dialog opens.
  useEffect(() => {
    if (!open || !invoice || !snapshot || !invoice.contract_id) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const map = await reloadLiveData();
        if (cancelled) return;

        const primary = map[String(invoice.contract_id)] || Object.values(map)[0];
        setContractRow(primary?.contract || null);
        setContractType(primary?.contractType || primary?.contract?.contract_types || null);
        setFidelity(
          verifySnapshotReproduces(snapshot, {
            invoiceDate: new Date(invoice.invoice_date),
            billingFrequency: invoice.billing_frequency,
            contractType: primary?.contractType || null,
          }),
        );
        onFreshLoad?.(primary);
      } catch (e) {
        console.error("[Revision] Failed to load live data:", e);
        toast.error("Could not load current asset data for this contract");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoice?.id]);

  // Diff each contract against its own live data, then aggregate. Re-runs when
  // an asset is marked as ignored so the zero lists update immediately.
  useEffect(() => {
    if (!open || !snapshot || Object.keys(liveByContract).length === 0) return;

    const per: PerContractDiff[] = units.map((u) => {
      const live = liveByContract[u.contractId];
      const unitSnapshot = { assets: u.assets } as unknown as InvoiceInputSnapshot;
      // Only Jubaili prices on genset kVA; everything else is MWp.
      const packageType = (u.contract as any)?.package ?? (live?.contract as any)?.package ?? null;
      return {
        contractId: u.contractId,
        contractName: u.contractName,
        diff: diffSnapshotAgainstLive(unitSnapshot, live?.assets || [], ignoredIds, { packageType }),
        snapshotOrgs: u.orgs?.length || 0,
        liveOrgs: live?.orgBreakdown?.length || 0,
      };
    });

    setPerContractDiff(per);

    const aggregate: SnapshotDiff = {
      corrections: per.flatMap((p) => p.diff.corrections),
      newlyOnboarded: per.flatMap((p) => p.diff.newlyOnboarded),
      removed: per.flatMap((p) => p.diff.removed),
      changed: per.flatMap((p) => p.diff.changed),
      unchangedCount: per.reduce((s, p) => s + p.diff.unchangedCount, 0),
      stillZeroCount: per.reduce((s, p) => s + p.diff.stillZeroCount, 0),
      stillZero: per.flatMap((p) => p.diff.stillZero),
      snapshotTotalMW: per.reduce((s, p) => s + p.diff.snapshotTotalMW, 0),
      liveTotalMW: per.reduce((s, p) => s + p.diff.liveTotalMW, 0),
    };
    setDiff(aggregate);

    const correctionIds = new Set(aggregate.corrections.map((c) => c.assetId));
    if (diffInitialisedFor.current === invoice?.id) {
      setSelectedIds((prev) => prev.filter((id) => correctionIds.has(id)));
    } else {
      diffInitialisedFor.current = invoice?.id ?? null;
      setSelectedIds([...correctionIds]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoice?.id, liveByContract, ignoredKey]);

  const toggleAsset = useCallback(
    (assetId: string) =>
      setSelectedIds((prev) =>
        prev.includes(assetId) ? prev.filter((id) => id !== assetId) : [...prev, assetId],
      ),
    [],
  );

  return {
    units,
    loading,
    liveByContract,
    contractRow,
    contractType,
    diff,
    perContractDiff,
    selectedIds,
    setSelectedIds,
    toggleAsset,
    fidelity,
    reloadLiveData,
  };
}

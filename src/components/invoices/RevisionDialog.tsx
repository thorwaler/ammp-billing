import { useEffect, useMemo, useRef, useState } from "react";
import { useIgnoredAssets } from "@/hooks/useIgnoredAssets";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertTriangle, RotateCcw, EyeOff, BatteryCharging } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import {
  computeRevisionForInvoice,
  diffSnapshotAgainstLive,
  fetchLiveContractData,
  isLegacyMergedSnapshot,
  revisionUnits,
  verifySnapshotReproduces,
  type CorrectionSelection,
  type LiveAsset,
  type SnapshotDiff,
  type StillZeroAsset,
} from "@/lib/invoiceRevision";

import { buildContractLineItems } from "@/lib/xeroLineItems";
import { buildSnapshotFields, type InvoiceInputSnapshot } from "@/lib/invoiceSnapshot";
import { isPackage2026 } from "@/data/pricingData";
import { isBatteryOnlyAsset, batteryCapacityKWh } from "@/lib/batteryOnlyAssets";

const ACCOUNT_PLATFORM_FEES = "1002";
const ACCOUNT_IMPLEMENTATION_FEES = "1000";

type XeroAction = "update" | "void_new" | "manual";

export interface ReviseInvoice {
  id: string;
  invoice_date: string;
  customer_id: string;
  contract_id: string | null;
  merged_contract_ids: string[] | null;
  billing_frequency: string;
  currency: string;
  invoice_amount: number;
  invoice_amount_eur: number | null;
  xero_invoice_id: string | null;
  xero_contact_name: string | null;
  prepaid_balance_delta: number | null;
  input_snapshot: any | null;
  revision_deadline: string | null;
  customer?: { name: string } | null;
}

interface RevisionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: ReviseInvoice | null;
  onRevised?: () => void;
}

export function RevisionDialog({ open, onOpenChange, invoice, onRevised }: RevisionDialogProps) {
  const { ignoredIds, isIgnored, toggle: toggleIgnoredAsset } = useIgnoredAssets();
  const ignoredKey = useMemo(() => [...ignoredIds].sort().join(","), [ignoredIds]);
  const diffInitialisedFor = useRef<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [liveByContract, setLiveByContract] = useState<
    Record<string, { assets: LiveAsset[]; orgBreakdown?: any[]; contract?: any; contractType?: any }>
  >({});
  const [contractRow, setContractRow] = useState<any>(null);
  const [contractType, setContractType] = useState<any>(null);
  const [diff, setDiff] = useState<SnapshotDiff | null>(null);
  const [perContractDiff, setPerContractDiff] = useState<
    Array<{ contractId: string; contractName?: string; diff: SnapshotDiff; snapshotOrgs: number; liveOrgs: number }>
  >([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [manualInputs, setManualInputs] = useState<Record<string, string>>({});
  /** Asset ids whose manual value was filled from the battery inverter rating. */
  const [batterySourced, setBatterySourced] = useState<Set<string>>(new Set());
  const [fetchingBattery, setFetchingBattery] = useState(false);
  const [includeNewlyOnboarded, setIncludeNewlyOnboarded] = useState(false);
  const [reason, setReason] = useState("");

  const [xeroAction, setXeroAction] = useState<XeroAction>("update");
  const [overrideFidelity, setOverrideFidelity] = useState(false);
  const [fidelity, setFidelity] = useState<
    { ok: boolean; recomputed: number; frozen: number; reproducible: boolean; reason?: string } | null
  >(null);

  const snapshot: InvoiceInputSnapshot | null = (invoice?.input_snapshot as InvoiceInputSnapshot) || null;
  const currencySymbol = invoice?.currency === "USD" ? "$" : "€";
  const units = useMemo(() => (snapshot ? revisionUnits(snapshot) : []), [snapshot]);
  const isMerged = units.length > 1;
  const legacyMerged = isLegacyMergedSnapshot(snapshot);

  useEffect(() => {
    if (!open || !invoice || !snapshot || !invoice.contract_id) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const loaded = await Promise.all(
          units.map(async (u) => [u.contractId, await fetchLiveContractData(u.contractId)] as const),
        );
        if (cancelled) return;

        const map: Record<string, any> = {};
        for (const [id, live] of loaded) {
          map[id] = {
            assets: live.assets,
            orgBreakdown: live.orgBreakdown,
            contract: live.contract,
            contractType: live.contractType,
          };
        }
        setLiveByContract(map);
        const primary = map[String(invoice.contract_id)] || loaded[0]?.[1];
        setContractRow(primary?.contract || null);
        setContractType(primary?.contractType || primary?.contract?.contract_types || null);

        setManualInputs({});
        setBatterySourced(new Set());
        setIncludeNewlyOnboarded(false);

        setReason("");
        setOverrideFidelity(false);
        setXeroAction(invoice.xero_invoice_id ? "update" : "manual");
        setFidelity(
          verifySnapshotReproduces(snapshot, {
            invoiceDate: new Date(invoice.invoice_date),
            billingFrequency: invoice.billing_frequency,
            contractType: primary?.contractType || null,
          }),
        );
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
  }, [open, invoice?.id]);

  // Diff each contract against its own live data, then aggregate. Re-runs when
  // an asset is marked as ignored so the zero lists update immediately.
  useEffect(() => {
    if (!open || !snapshot || Object.keys(liveByContract).length === 0) return;

    const per = units.map((u) => {
      const live = liveByContract[u.contractId];
      const unitSnapshot = { assets: u.assets } as unknown as InvoiceInputSnapshot;
      // Only Jubaili prices on genset kVA; everything else is MWp.
      const packageType =
        (u.contract as any)?.package ?? (live?.contract as any)?.package ?? null;
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
  }, [open, invoice?.id, liveByContract, ignoredKey]);


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
      out[assetId] =
        metricById.get(assetId) === "kva" ? { kva: value, source } : { mw: value, source };
    }
    return out;
  }, [manualInputs, metricById, batterySourced]);

  const manualCount = Object.keys(manualOverrides).length;
  const batteryCount = Object.keys(manualOverrides).filter((id) => batterySourced.has(id)).length;

  const selection: CorrectionSelection = useMemo(
    () => ({ mode: "zero_mw_only", selectedAssetIds: selectedIds, includeNewlyOnboarded, manualOverrides }),
    [selectedIds, includeNewlyOnboarded, manualOverrides],
  );

  const computation = useMemo(() => {
    if (!snapshot || !invoice || loading || legacyMerged) return null;
    try {
      return computeRevisionForInvoice(snapshot, liveByContract as any, selection, {
        invoiceDate: new Date(invoice.invoice_date),
        billingFrequency: invoice.billing_frequency,
        contractType,
      });
    } catch (e) {
      console.error("[Revision] Recalculation failed:", e);
      return null;
    }
  }, [snapshot, invoice?.id, liveByContract, selection, contractType, loading, legacyMerged]);

  const newTotal = computation?.totalPrice ?? 0;
  const totalMW = computation?.totalMW ?? 0;
  const originalTotal = Number(invoice?.invoice_amount) || 0;
  const delta = newTotal - originalTotal;

  const fmt = (n: number) =>
    `${currencySymbol}${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  const toggleAsset = (assetId: string) =>
    setSelectedIds((prev) => (prev.includes(assetId) ? prev.filter((id) => id !== assetId) : [...prev, assetId]));

  const setManual = (assetId: string, value: string) => {
    setManualInputs((prev) => ({ ...prev, [assetId]: value }));
    // Typing over a battery-filled value makes it a hand-entered value again.
    setBatterySourced((prev) => {
      if (!prev.has(assetId)) return prev;
      const next = new Set(prev);
      next.delete(assetId);
      return next;
    });
  };

  /** Battery inverter rating (kW) usable as a capacity for a still-zero site. */
  const batteryKWFor = (z: StillZeroAsset): number | null => {
    if (z.metric !== "mw") return null;
    const kw = z.batteryInverterKW;
    return kw != null && Number.isFinite(Number(kw)) && Number(kw) > 0 ? Number(kw) : null;
  };

  const useBatteryValue = (z: StillZeroAsset) => {
    const kw = batteryKWFor(z);
    if (kw == null) return;
    const mw = kw / 1000;
    setManualInputs((prev) => ({ ...prev, [z.assetId]: String(Number(mw.toFixed(6))) }));
    setBatterySourced((prev) => new Set(prev).add(z.assetId));
  };

  const batteryEligible = useMemo(
    () => (diff?.stillZero || []).filter((z) => batteryKWFor(z) != null),
    [diff],
  );

  const useBatteryForAll = () => {
    if (batteryEligible.length === 0) return;
    setManualInputs((prev) => {
      const next = { ...prev };
      for (const z of batteryEligible) {
        const kw = batteryKWFor(z)!;
        next[z.assetId] = String(Number((kw / 1000).toFixed(6)));
      }
      return next;
    });
    setBatterySourced((prev) => {
      const next = new Set(prev);
      for (const z of batteryEligible) next.add(z.assetId);
      return next;
    });
  };

  const clearManual = () => {
    setManualInputs({});
    setBatterySourced(new Set());
  };

  /**
   * Battery inverter ratings live in AMMP's `asset_specific_params`, which only
   * the single-asset endpoints return — org-resolved contracts never see them.
   * This pulls them for the still-zero sites only, then reloads the diff.
   */
  const fetchBatteryData = async () => {
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

      const loaded = await Promise.all(
        units.map(async (u) => [u.contractId, await fetchLiveContractData(u.contractId)] as const),
      );
      const map: Record<string, any> = {};
      for (const [id, live] of loaded) {
        map[id] = {
          assets: live.assets,
          orgBreakdown: live.orgBreakdown,
          contract: live.contract,
          contractType: live.contractType,
        };
      }
      setLiveByContract(map);
      toast.success("Battery data refreshed for the zero-capacity sites");
    } catch (e) {
      console.error("[Revision] Battery data fetch failed:", e);
      toast.error("Could not fetch battery data from AMMP");
    } finally {
      setFetchingBattery(false);
    }
  };





  const handleConfirm = async () => {
    if (!invoice || !snapshot || !computation) return;
    setSubmitting(true);
    try {
      // Build the Xero lines contract by contract, so merged invoices keep one
      // labelled block per contract exactly as they were originally issued.
      const lineItems = computation.units.flatMap(({ contractId, contractName, computation: comp }) => {
        const row = liveByContract[contractId]?.contract || contractRow;
        const packageType = comp.params.packageType;
        const trial = !!row?.is_trial && isPackage2026(packageType);
        const lines = buildContractLineItems({
          result: comp.result,
          packageType,
          currencySymbol,
          accountCode: ACCOUNT_PLATFORM_FEES,
          implementationAccountCode: ACCOUNT_IMPLEMENTATION_FEES,
          mwManaged: comp.totalMW,
          isTrial: trial,
          trialSetupFee: trial ? Number(row?.trial_setup_fee) || 0 : 0,
          vendorApiOnboardingFee: trial ? Number(row?.vendor_api_onboarding_fee) || 0 : 0,
        });
        if (!isMerged) return lines;
        const label = contractName || row?.contract_name || row?.company_name || "Contract";
        return lines.map((li) => ({ ...li, Description: `[${label}] ${li.Description}` }));
      });

      const revisedAssets = computation.units.flatMap((u) => u.computation.params.assetBreakdown || []);
      const revisedOrgs = computation.units.flatMap(
        (u) => (u.computation.params.orgBreakdown as any[]) || [],
      );

      const sumFor = (code: string) =>
        lineItems.filter((li) => li.AccountCode === code).reduce((s, li) => s + (li.UnitAmount || 0), 0);
      const arrAmount = sumFor(ACCOUNT_PLATFORM_FEES);
      const nrrAmount = sumFor(ACCOUNT_IMPLEMENTATION_FEES);


      // Xero: update the existing invoice in place, or void it and issue a new draft.
      let newXeroInvoiceId: string | null = invoice.xero_invoice_id;
      if (invoice.xero_invoice_id && xeroAction !== "manual") {
        const contactName = invoice.customer?.name || invoice.xero_contact_name;
        const basePayload: Record<string, any> = {
          Type: "ACCREC",
          Contact: { Name: contactName },
          Date: format(new Date(invoice.invoice_date), "yyyy-MM-dd"),
          LineItems: lineItems,
          CurrencyCode: invoice.currency,
          Status: "DRAFT",
        };

        if (xeroAction === "update") {
          const { data, error } = await supabase.functions.invoke("xero-send-invoice", {
            body: { invoice: { ...basePayload, InvoiceID: invoice.xero_invoice_id } },
          });
          if (error) throw error;
          newXeroInvoiceId = data?.invoice?.Invoices?.[0]?.InvoiceID || invoice.xero_invoice_id;
        } else {
          const { error: voidError } = await supabase.functions.invoke("xero-send-invoice", {
            body: { invoice: { InvoiceID: invoice.xero_invoice_id, Status: "VOIDED" } },
          });
          if (voidError) throw voidError;
          const { data, error } = await supabase.functions.invoke("xero-send-invoice", {
            body: { invoice: basePayload },
          });
          if (error) throw error;
          newXeroInvoiceId = data?.invoice?.Invoices?.[0]?.InvoiceID || null;
        }
      } else if (xeroAction === "manual") {
        newXeroInvoiceId = null;
      }

      // Prepaid balance: shift the contract's YTD by the revision delta only.
      let newPrepaidDelta: number | null = null;
      if (invoice.prepaid_balance_delta != null && invoice.contract_id) {
        newPrepaidDelta = Number(invoice.prepaid_balance_delta) + delta;
        const { data: c } = await supabase
          .from("contracts")
          .select("ytd_invoiced_amount")
          .eq("id", invoice.contract_id)
          .maybeSingle();
        const nextYtd = (Number(c?.ytd_invoiced_amount) || 0) + delta;
        await supabase
          .from("contracts")
          .update({ ytd_invoiced_amount: nextYtd })
          .eq("id", invoice.contract_id);
      }

      const eurRatio =
        invoice.invoice_amount_eur != null && originalTotal > 0
          ? Number(invoice.invoice_amount_eur) / originalTotal
          : null;

      const snapshotFields = buildSnapshotFields({
        freezeEnabled: true,
        contractId: invoice.contract_id as string,
        customerId: invoice.customer_id,
        invoiceDate: new Date(invoice.invoice_date),
        periodStart: snapshot.periodStart,
        periodEnd: snapshot.periodEnd,
        currency: invoice.currency,
        exchangeRateEUR: snapshot.exchangeRateEUR ?? null,
        contract: snapshot.contract,
        capabilities: { assets: revisedAssets, orgBreakdown: revisedOrgs },
        // Keep per-contract inputs on the revised invoice too, so it stays
        // revisable in turn.
        contracts: computation.units.map(({ contractId, contractName, computation: comp }) => {
          const unit = units.find((u) => u.contractId === contractId);
          return {
            contractId,
            contractName,
            billingFrequency: unit?.billingFrequency || invoice.billing_frequency,
            periodStart: unit?.periodStart ?? snapshot.periodStart,
            periodEnd: unit?.periodEnd ?? snapshot.periodEnd,
            subtotal: comp.result.totalPrice,
            contract: (unit?.contract || {}) as Record<string, unknown>,
            capabilities: {
              assets: comp.params.assetBreakdown,
              orgBreakdown: comp.params.orgBreakdown,
            },
          };
        }),
        lineItems: lineItems.map((li) => ({
          description: li.Description,
          quantity: li.Quantity,
          unitAmount: li.UnitAmount,
          accountCode: li.AccountCode,
        })),
        totals: {
          invoiceAmount: newTotal,
          arrAmount,
          nrrAmount,
          totalMW: computation.totalMW,
          siteCount: revisedAssets.length,
        },

      });

      const userId = (await supabase.auth.getUser()).data.user?.id as string;

      const { data: inserted, error: insertError } = await supabase
        .from("invoices")
        .insert({
          user_id: userId,
          customer_id: invoice.customer_id,
          contract_id: invoice.contract_id,
          invoice_date: invoice.invoice_date,
          billing_frequency: invoice.billing_frequency,
          currency: invoice.currency,
          mw_managed: computation.totalMW,
          total_mw: computation.totalMW,
          invoice_amount: newTotal,
          invoice_amount_eur: eurRatio != null ? newTotal * eurRatio : null,
          arr_amount: arrAmount,
          arr_amount_eur: eurRatio != null ? arrAmount * eurRatio : null,
          nrr_amount: nrrAmount,
          nrr_amount_eur: eurRatio != null ? nrrAmount * eurRatio : null,
          source: "internal",
          xero_invoice_id: newXeroInvoiceId,
          xero_line_items: lineItems as any,
          prepaid_balance_delta: newPrepaidDelta,
          revised_from_invoice_id: invoice.id,
          revision_reason:
            [reason, manualCount > 0 ? `${manualCount} site(s) set manually` : ""]
              .filter(Boolean)
              .join(" · ") || null,
          ...(snapshotFields
            ? {
                ...snapshotFields,
                input_snapshot: {
                  ...(snapshotFields.input_snapshot as any),
                  ...(manualCount > 0 ? { manualOverrides } : {}),
                } as any,
              }
            : {}),

        } as any)
        .select("id")
        .single();

      if (insertError) throw insertError;

      const { error: supersedeError } = await supabase
        .from("invoices")
        .update({
          superseded_by_invoice_id: inserted.id,
          superseded_at: new Date().toISOString(),
        })
        .eq("id", invoice.id);
      if (supersedeError) throw supersedeError;

      toast.success(
        `Invoice revised — ${fmt(originalTotal)} → ${fmt(newTotal)} (${delta >= 0 ? "+" : ""}${fmt(delta)})`,
      );
      if (xeroAction === "manual" && invoice.xero_invoice_id) {
        toast.warning("Xero was not updated — adjust the original invoice in Xero manually.");
      }
      toast.info("Regenerate the support document from the revised invoice if you need an updated PDF.");

      onOpenChange(false);
      onRevised?.();
    } catch (e: any) {
      console.error("[Revision] Failed:", e);
      toast.error(e?.message || "Failed to revise invoice");
    } finally {
      setSubmitting(false);
    }
  };

  const canRevise =
    !!snapshot &&
    !!invoice?.contract_id &&
    !!computation &&
    !loading &&
    !legacyMerged &&
    (fidelity?.ok !== false || overrideFidelity);


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4" />
            Revise invoice
          </DialogTitle>
          <DialogDescription>
            Corrects assets that were frozen at 0 MW and now report a real capacity. The original invoice stays in
            history, marked as superseded, and a revised invoice is created in its place.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !snapshot ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              This invoice has no frozen input snapshot, so it cannot be revised. Delete and recreate it instead.
            </AlertDescription>
          </Alert>
        ) : legacyMerged ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              This merged invoice was frozen before per-contract snapshots existed, so its contracts' rates cannot be
              reproduced. Delete and re-issue the merged invoice instead of revising it.
            </AlertDescription>
          </Alert>
        ) : (
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-4">
              {isMerged && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Merged invoice — {computation?.units.length || units.length} contracts are recomputed individually
                    and summed.
                  </AlertDescription>
                </Alert>
              )}

              {fidelity && !fidelity.ok && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Recomputing the untouched snapshot gives {fmt(fidelity.recomputed)} instead of the frozen{" "}
                    {fmt(fidelity.frozen)}
                    {fidelity.reason ? ` (${fidelity.reason})` : ""}. Review the revised total carefully before
                    confirming.
                    <label className="mt-2 flex items-center gap-2 text-xs">
                      <Checkbox
                        checked={overrideFidelity}
                        onCheckedChange={(v) => setOverrideFidelity(!!v)}
                      />
                      I understand and want to revise anyway
                    </label>
                  </AlertDescription>
                </Alert>
              )}

              {isMerged && perContractDiff.length > 0 && (
                <div className="rounded-md border text-xs">
                  {perContractDiff.map((p) => {
                    const unit = computation?.units.find((u) => u.contractId === p.contractId);
                    return (
                      <div key={p.contractId} className="flex justify-between border-b px-3 py-2 last:border-b-0">
                        <span className="truncate">{p.contractName || p.contractId.slice(0, 8)}</span>
                        <span className="text-muted-foreground">
                          {p.diff.corrections.length} correctable
                          {p.diff.stillZeroCount > 0 ? ` (${p.diff.stillZeroCount} still zero)` : ""} ·{" "}
                          {p.diff.newlyOnboarded.length} new · {unit ? fmt(unit.computation.result.totalPrice) : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                "Correctable" counts only sites that were frozen without a usable capacity (0 MWp, or no genset rating
                for Jubaili) and now report a real value in AMMP. Sites the sync still reports as zero can be given a
                value by hand below — that number is used for this revision only and is not written back to AMMP.
              </p>





              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-md border p-3">
                  <p className="text-muted-foreground text-xs">Frozen total</p>
                  <p className="font-semibold">{fmt(originalTotal)}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-muted-foreground text-xs">Revised total</p>
                  <p className="font-semibold">{fmt(newTotal)}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-muted-foreground text-xs">Difference</p>
                  <p className={`font-semibold ${delta >= 0 ? "text-primary" : "text-destructive"}`}>
                    {delta >= 0 ? "+" : ""}
                    {fmt(delta)}
                  </p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-medium">
                    Sites now reporting capacity ({diff?.corrections.length || 0})
                    {(diff?.stillZeroCount || 0) > 0 && (
                      <span className="ml-1 font-normal text-muted-foreground">
                        · {diff!.stillZeroCount} still zero
                      </span>
                    )}
                  </Label>
                  {(diff?.corrections.length || 0) > 0 && (
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedIds(diff!.corrections.map((c) => c.assetId))}
                      >
                        Select all
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>
                        Clear
                      </Button>
                    </div>
                  )}
                </div>

                {(diff?.corrections.length || 0) === 0 ? (
                  <p className="text-sm text-muted-foreground rounded-md border p-3">
                    No frozen site without capacity (0 MWp or no genset rating) reports a value in the current data.
                    Use the manual section below if you need to price one anyway.
                  </p>
                ) : (
                  <div className="rounded-md border divide-y">
                    {diff!.corrections.map((c) => (
                      <div key={c.assetId} className="flex items-center gap-3 p-2 text-sm">
                        <Checkbox
                          checked={selectedIds.includes(c.assetId)}
                          onCheckedChange={() => toggleAsset(c.assetId)}
                        />
                        <span className="flex-1 truncate">
                          {c.assetName}
                          <span className="block text-xs text-muted-foreground">
                            ID: {c.assetId}
                          </span>
                          {c.metric === "kva" && c.ratingUnknownAtFreeze && (
                            <span className="block text-xs text-muted-foreground">rating unknown at freeze</span>
                          )}
                          {manualOverrides[c.assetId] && (
                            <span className="block text-xs text-primary">manual value overrides the sync</span>
                          )}
                        </span>
                        <span className="text-muted-foreground whitespace-nowrap">
                          {c.metric === "kva"
                            ? `${c.previousKVA ?? 0} → ${Number(c.newKVA || 0).toLocaleString()} kVA`
                            : `0 MW → ${c.newMW.toFixed(3)} MW`}
                        </span>
                        <Input
                          type="number"
                          min={0}
                          step={c.metric === "kva" ? 1 : 0.001}
                          value={manualInputs[c.assetId] ?? ""}
                          onChange={(e) => setManual(c.assetId, e.target.value)}
                          placeholder={c.metric === "kva" ? "kVA" : "MWp"}
                          className="h-8 w-24"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {(diff?.stillZero.length || 0) > 0 && (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <Label className="text-sm font-medium">
                      Still zero — set manually ({diff!.stillZero.length})
                      {manualCount > 0 && (
                        <span className="ml-1 font-normal text-muted-foreground">
                          · {manualCount} set{batteryCount > 0 ? ` (${batteryCount} from battery)` : ""}
                        </span>
                      )}
                    </Label>
                    <div className="flex items-center gap-1">
                      {batteryEligible.length > 0 && (
                        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={useBatteryForAll}>
                          <BatteryCharging className="h-3 w-3 mr-1" />
                          Use battery capacity for all ({batteryEligible.length})
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs"
                        disabled={fetchingBattery}
                        title="Ask AMMP for the battery inverter rating of these sites"
                        onClick={fetchBatteryData}
                      >
                        {fetchingBattery ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3 w-3 mr-1" />
                        )}
                        Fetch battery data
                      </Button>
                      {manualCount > 0 && (
                        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearManual}>
                          Clear manual values
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="rounded-md border divide-y max-h-72 overflow-y-auto">
                    {perContractDiff
                      .filter((p) => p.diff.stillZero.length > 0)
                      .map((p) => (
                        <div key={p.contractId}>
                          {isMerged && (
                            <div className="bg-muted/50 px-2 py-1 text-xs font-medium">
                              {p.contractName || p.contractId.slice(0, 8)}
                            </div>
                          )}
                          {p.diff.stillZero.map((z) => {
                            const batteryOnly = z.isBatteryOnly || isBatteryOnlyAsset(z.assetId);
                            const batteryKWh = z.batteryCapacityKWh ?? batteryCapacityKWh(z.assetId);
                            const batteryKW = batteryKWFor(z);
                            const fromBattery = batterySourced.has(z.assetId);
                            const batteryText = [
                              batteryKW != null ? `battery inverter ${batteryKW.toFixed(0)} kW` : null,
                              batteryKWh != null ? `${batteryKWh.toFixed(0)} kWh battery` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ");
                            return (
                            <div key={z.assetId} className="flex items-center gap-3 p-2 text-sm">
                              <span className="flex-1 truncate">
                                {z.assetName}
                                {batteryOnly && (
                                  <Badge variant="outline" className="ml-2 text-xs">Battery-only</Badge>
                                )}
                                {fromBattery && (
                                  <Badge variant="secondary" className="ml-2 text-xs">
                                    manual value (battery)
                                  </Badge>
                                )}
                                <span className="block text-xs text-muted-foreground">
                                  ID: {z.assetId} ·{" "}
                                  {batteryOnly
                                    ? "no PV inverter — 0 MWp expected"
                                    : z.metric === "kva"
                                      ? "no genset rating in AMMP"
                                      : "0 MWp in AMMP"}
                                  {batteryText ? ` · ${batteryText}` : ""}
                                </span>
                              </span>
                              {batteryKW != null && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 px-2 text-xs whitespace-nowrap"
                                  title={`Bill this site on its battery inverter rating (${batteryKW.toFixed(0)} kW = ${(batteryKW / 1000).toFixed(3)} MWp)`}
                                  onClick={() => useBatteryValue(z)}
                                >
                                  <BatteryCharging className="h-3 w-3 mr-1" />
                                  Use battery
                                </Button>
                              )}
                              <Input
                                type="number"
                                min={0}
                                step={z.metric === "kva" ? 1 : 0.001}
                                value={manualInputs[z.assetId] ?? ""}
                                onChange={(e) => setManual(z.assetId, e.target.value)}
                                placeholder={z.metric === "kva" ? "kVA" : "MWp"}
                                className="h-8 w-24"
                              />

                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-xs whitespace-nowrap"
                                title="Mark this site as not relevant — it stops raising zero-capacity alerts and warnings"
                                onClick={() => toggleIgnoredAsset(z.assetId, z.assetName)}
                              >
                                <EyeOff className="h-3 w-3 mr-1" />
                                {isIgnored(z.assetId) ? "Ignored" : "Ignore"}
                              </Button>
                            </div>
                            );
                          })}
                        </div>
                      ))}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Battery inverter ratings come from AMMP's single-asset data. If none are shown, use "Fetch
                    battery data" to pull them for these sites.
                  </p>
                </div>
              )}


              <Separator />

              <div className="space-y-2">
                <label className="flex items-start gap-3 text-sm cursor-pointer">
                  <Checkbox
                    checked={includeNewlyOnboarded}
                    onCheckedChange={(v) => setIncludeNewlyOnboarded(!!v)}
                  />
                  <span>
                    Include newly onboarded assets
                    <span className="block text-xs text-muted-foreground">
                      {diff?.newlyOnboarded.length || 0} asset(s) appeared after this invoice was frozen. They stay out
                      of the revision unless you tick this.
                    </span>
                  </span>
                </label>

                {(diff?.changed.length || 0) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {diff!.changed.length} asset(s) changed MW without having been zero — those stay frozen.
                  </p>
                )}
                {(diff?.removed.length || 0) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {diff!.removed.length} frozen asset(s) no longer exist in AMMP — they stay billed as frozen,
                    in the organisation they belonged to when the invoice was frozen.
                  </p>
                )}
              </div>

              {invoice.xero_invoice_id && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Xero</Label>
                    <RadioGroup value={xeroAction} onValueChange={(v) => setXeroAction(v as XeroAction)}>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <RadioGroupItem value="update" /> Update the existing Xero invoice in place
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <RadioGroupItem value="void_new" /> Void the original and create a new draft
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <RadioGroupItem value="manual" /> Leave Xero untouched (I'll handle it manually)
                      </label>
                    </RadioGroup>
                    <p className="text-xs text-muted-foreground">
                      Updating in place only works while the Xero invoice is still a draft.
                    </p>
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="revision-reason" className="text-sm font-medium">
                  Reason (optional)
                </Label>
                <Textarea
                  id="revision-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. PV capacity for 3 sites was restored in AMMP after the invoice was cut"
                  rows={2}
                />
              </div>
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="gap-2">
          <Badge variant="outline" className="mr-auto self-center">
            {selectedIds.length} correction{selectedIds.length === 1 ? "" : "s"} selected
            {manualCount > 0 ? ` · ${manualCount} manual` : ""}
          </Badge>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={
              !canRevise ||
              submitting ||
              (selectedIds.length === 0 && manualCount === 0 && !includeNewlyOnboarded)
            }
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create revised invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

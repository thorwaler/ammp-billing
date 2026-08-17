import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertTriangle, RotateCcw } from "lucide-react";
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
} from "@/lib/invoiceRevision";

import { buildContractLineItems } from "@/lib/xeroLineItems";
import { buildSnapshotFields, type InvoiceInputSnapshot } from "@/lib/invoiceSnapshot";
import { isPackage2026 } from "@/data/pricingData";

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

        // Diff each contract against its own live data, then aggregate.
        const per = units.map((u) => {
          const live = map[u.contractId];
          const unitSnapshot = { assets: u.assets } as unknown as InvoiceInputSnapshot;
          return {
            contractId: u.contractId,
            contractName: u.contractName,
            diff: diffSnapshotAgainstLive(unitSnapshot, live?.assets || []),
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
          snapshotTotalMW: per.reduce((s, p) => s + p.diff.snapshotTotalMW, 0),
          liveTotalMW: per.reduce((s, p) => s + p.diff.liveTotalMW, 0),
        };
        setDiff(aggregate);
        setSelectedIds(aggregate.corrections.map((c) => c.assetId));
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

  const selection: CorrectionSelection = useMemo(
    () => ({ mode: "zero_mw_only", selectedAssetIds: selectedIds, includeNewlyOnboarded }),
    [selectedIds, includeNewlyOnboarded],
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


  const handleConfirm = async () => {
    if (!invoice || !snapshot || !computation) return;
    setSubmitting(true);
    try {
      const result = computation.result;
      const packageType = computation.params.packageType;
      const trial = !!contractRow?.is_trial && isPackage2026(packageType);

      const lineItems = buildContractLineItems({
        result,
        packageType,
        currencySymbol,
        accountCode: ACCOUNT_PLATFORM_FEES,
        implementationAccountCode: ACCOUNT_IMPLEMENTATION_FEES,
        mwManaged: computation.totalMW,
        isTrial: trial,
        trialSetupFee: trial ? Number(contractRow?.trial_setup_fee) || 0 : 0,
        vendorApiOnboardingFee: trial ? Number(contractRow?.vendor_api_onboarding_fee) || 0 : 0,
      });

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
        capabilities: { assets: computation.params.assetBreakdown, orgBreakdown: liveOrgBreakdown },
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
          siteCount: computation.params.assetBreakdown?.length,
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
          revision_reason: reason || null,
          ...(snapshotFields ? { ...snapshotFields, input_snapshot: snapshotFields.input_snapshot as any } : {}),
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

  const canRevise = !!snapshot && !!invoice?.contract_id && !!computation && !loading;

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
        ) : !invoice?.contract_id ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Merged invoices cannot be revised yet — delete and recreate the merged invoice instead.
            </AlertDescription>
          </Alert>
        ) : (
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-4">
              {fidelity && !fidelity.ok && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Recomputing the untouched snapshot gives {fmt(fidelity.recomputed)} instead of the frozen{" "}
                    {fmt(fidelity.frozen)}. Review the revised total carefully before confirming.
                  </AlertDescription>
                </Alert>
              )}

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
                    Zero-MW assets now reporting capacity ({diff?.corrections.length || 0})
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
                    No frozen 0 MW asset has a capacity in the current data. There is nothing to correct.
                  </p>
                ) : (
                  <div className="rounded-md border divide-y">
                    {diff!.corrections.map((c) => (
                      <label key={c.assetId} className="flex items-center gap-3 p-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={selectedIds.includes(c.assetId)}
                          onCheckedChange={() => toggleAsset(c.assetId)}
                        />
                        <span className="flex-1 truncate">{c.assetName}</span>
                        <span className="text-muted-foreground">0 MW → {c.newMW.toFixed(3)} MW</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

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
                    {diff!.removed.length} frozen asset(s) no longer exist in AMMP — they stay billed as frozen.
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
          </Badge>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!canRevise || submitting || (selectedIds.length === 0 && !includeNewlyOnboarded)}
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create revised invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

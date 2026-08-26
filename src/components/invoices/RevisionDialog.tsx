import { useMemo, useState } from "react";
import { useIgnoredAssets } from "@/hooks/useIgnoredAssets";

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
import { Loader2, AlertTriangle, RotateCcw, BatteryCharging } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import {
  buildRevisedInvoiceRow,
  buildRevisedLineItems,
  computeRevisionForInvoice,
  isLegacyMergedSnapshot,
  type CorrectionSelection,
} from "@/lib/invoiceRevision";
import type { InvoiceInputSnapshot } from "@/lib/invoiceSnapshot";
import { useRevisionData } from "./revision/useRevisionData";
import { useManualCorrections } from "./revision/useManualCorrections";
import { CorrectionsList } from "./revision/CorrectionsList";
import { StillZeroList } from "./revision/StillZeroList";

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
  const [submitting, setSubmitting] = useState(false);
  const [includeNewlyOnboarded, setIncludeNewlyOnboarded] = useState(false);
  const [reason, setReason] = useState("");
  const [xeroAction, setXeroAction] = useState<XeroAction>("update");
  const [overrideFidelity, setOverrideFidelity] = useState(false);

  const snapshot: InvoiceInputSnapshot | null = (invoice?.input_snapshot as InvoiceInputSnapshot) || null;
  const currencySymbol = invoice?.currency === "USD" ? "$" : "€";
  const legacyMerged = isLegacyMergedSnapshot(snapshot);

  const {
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
  } = useRevisionData({
    open,
    invoice,
    snapshot,
    ignoredIds,
    onFreshLoad: () => {
      manual.reset();
      setIncludeNewlyOnboarded(false);
      setReason("");
      setOverrideFidelity(false);
      setXeroAction(invoice?.xero_invoice_id ? "update" : "manual");
    },
  });

  const manual = useManualCorrections({ diff, perContractDiff, reloadLiveData });
  const isMerged = units.length > 1;

  const selection: CorrectionSelection = useMemo(
    () => ({
      mode: "zero_mw_only",
      selectedAssetIds: selectedIds,
      includeNewlyOnboarded,
      manualOverrides: manual.manualOverrides,
    }),
    [selectedIds, includeNewlyOnboarded, manual.manualOverrides],
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
  const originalTotal = Number(invoice?.invoice_amount) || 0;
  const delta = newTotal - originalTotal;

  const fmt = (n: number) =>
    `${currencySymbol}${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  const handleConfirm = async () => {
    if (!invoice || !snapshot || !computation) return;
    setSubmitting(true);
    try {
      const lines = buildRevisedLineItems({
        computation,
        liveByContract,
        fallbackContract: contractRow,
        currencySymbol,
        isMerged,
      });

      // Xero: update the existing invoice in place, or void it and issue a new draft.
      let newXeroInvoiceId: string | null = invoice.xero_invoice_id;
      if (invoice.xero_invoice_id && xeroAction !== "manual") {
        const contactName = invoice.customer?.name || invoice.xero_contact_name;
        const basePayload: Record<string, any> = {
          Type: "ACCREC",
          Contact: { Name: contactName },
          Date: format(new Date(invoice.invoice_date), "yyyy-MM-dd"),
          LineItems: lines.lineItems,
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
        await supabase.from("contracts").update({ ytd_invoiced_amount: nextYtd }).eq("id", invoice.contract_id);
      }

      const userId = (await supabase.auth.getUser()).data.user?.id as string;

      const { data: inserted, error: insertError } = await supabase
        .from("invoices")
        .insert(
          buildRevisedInvoiceRow({
            invoice,
            snapshot,
            units,
            computation,
            lines,
            userId,
            xeroInvoiceId: newXeroInvoiceId,
            prepaidDelta: newPrepaidDelta,
            reason,
            manualOverrides: manual.manualOverrides,
          }) as any,
        )
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
      <DialogContent className="max-w-3xl h-[90vh] max-h-[90vh] !flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
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
          <ScrollArea className="flex-1 min-h-0 overflow-hidden">
            <div className="space-y-4 pr-4 pb-2">
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
                      <Checkbox checked={overrideFidelity} onCheckedChange={(v) => setOverrideFidelity(!!v)} />
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

                <CorrectionsList
                  corrections={diff?.corrections || []}
                  selectedIds={selectedIds}
                  manualInputs={manual.manualInputs}
                  hasManualOverride={(id) => !!manual.manualOverrides[id]}
                  onToggle={toggleAsset}
                  onManualChange={manual.setManual}
                />
              </div>

              {(diff?.stillZero.length || 0) > 0 && (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <Label className="text-sm font-medium">
                      Still zero — set manually ({diff!.stillZero.length})
                      {manual.manualCount > 0 && (
                        <span className="ml-1 font-normal text-muted-foreground">
                          · {manual.manualCount} set
                          {manual.batteryCount > 0 ? ` (${manual.batteryCount} from battery)` : ""}
                        </span>
                      )}
                    </Label>
                    <div className="flex items-center gap-1">
                      {manual.batteryEligible.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={manual.useBatteryForAll}
                        >
                          <BatteryCharging className="h-3 w-3 mr-1" />
                          Use battery capacity for all ({manual.batteryEligible.length})
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs"
                        disabled={manual.fetchingBattery}
                        title="Ask AMMP for the battery inverter rating of these sites"
                        onClick={manual.fetchBatteryData}
                      >
                        {manual.fetchingBattery ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3 w-3 mr-1" />
                        )}
                        Fetch battery data
                      </Button>
                      {manual.manualCount > 0 && (
                        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={manual.clearManual}>
                          Clear manual values
                        </Button>
                      )}
                    </div>
                  </div>

                  <StillZeroList
                    perContractDiff={perContractDiff}
                    isMerged={isMerged}
                    manualInputs={manual.manualInputs}
                    batterySourced={manual.batterySourced}
                    batteryKWFor={manual.batteryKWFor}
                    onManualChange={manual.setManual}
                    onUseBattery={manual.useBatteryValue}
                    isIgnored={isIgnored}
                    onToggleIgnored={toggleIgnoredAsset}
                  />

                  <p className="mt-1 text-xs text-muted-foreground">
                    {manual.batteryFetched && manual.batteryEligible.length === 0
                      ? "AMMP holds no battery inverter rating for these sites, so there is nothing to take over automatically — enter a capacity by hand, or ignore the site."
                      : 'Battery inverter ratings come from AMMP\u2019s single-asset data. If none are shown, use "Fetch battery data" to pull them for these sites.'}
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
                    {diff!.removed.length} frozen asset(s) no longer exist in AMMP — they stay billed as frozen, in the
                    organisation they belonged to when the invoice was frozen.
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

        <DialogFooter className="gap-2 shrink-0">
          <Badge variant="outline" className="mr-auto self-center">
            {selectedIds.length} correction{selectedIds.length === 1 ? "" : "s"} selected
            {manual.manualCount > 0 ? ` · ${manual.manualCount} manual` : ""}
          </Badge>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={
              !canRevise ||
              submitting ||
              (selectedIds.length === 0 && manual.manualCount === 0 && !includeNewlyOnboarded)
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

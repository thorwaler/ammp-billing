import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import type { CustomRecurringAddon } from "@/lib/invoiceCalculations";

interface CustomAnnualFeeEditorProps {
  fees: CustomRecurringAddon[];
  onChange: (fees: CustomRecurringAddon[]) => void;
  currency?: string;
  billingFrequency?: string;
}

const newId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `fee_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Cycle options for "bill once per year"; value = a month inside that cycle (last month). */
function cycleOptions(billingFrequency?: string): { value: number; label: string }[] {
  if (billingFrequency === "quarterly") {
    return [3, 6, 9, 12].map((m, i) => ({ value: m, label: `Q${i + 1} invoice` }));
  }
  if (billingFrequency === "biannual") {
    return [{ value: 6, label: "H1 invoice" }, { value: 12, label: "H2 invoice" }];
  }
  return MONTHS.map((m, i) => ({ value: i + 1, label: `${m} invoice` }));
}

/** Snap a stored month onto the matching cycle option for the current frequency. */
function snapMonth(month: number | undefined, billingFrequency?: string): number {
  const m = month || 12;
  if (billingFrequency === "quarterly") return Math.ceil(m / 3) * 3;
  if (billingFrequency === "biannual") return m <= 6 ? 6 : 12;
  return m;
}

/**
 * Contract-level custom recurring fees. Available on every package. Each fee is
 * either split across the billing cycle or billed in full once a year on a
 * chosen cycle (e.g. every Q4 invoice).
 */
export function CustomAnnualFeeEditor({ fees, onChange, currency = "EUR", billingFrequency }: CustomAnnualFeeEditorProps) {
  const symbol = currency === "USD" ? "$" : "€";
  const isAnnualBilling = billingFrequency === "annual";
  const options = cycleOptions(billingFrequency);

  const update = (id: string, patch: Partial<CustomRecurringAddon>) => {
    onChange(fees.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Custom Annual Fees</CardTitle>
        <CardDescription>
          Recurring yearly charges specific to this contract. Split them across every invoice, or bill the full
          amount once a year on a chosen invoice. Either way they count as recurring revenue.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {fees.length === 0 && (
          <p className="text-sm text-muted-foreground">No custom annual fees on this contract.</p>
        )}

        {fees.map((fee) => {
          const schedule = fee.billingSchedule === "once" ? "once" : "split";
          return (
            <div key={fee.id} className="grid grid-cols-1 md:grid-cols-[1fr_160px_200px_150px_auto] gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-xs">Title</Label>
                <Input
                  placeholder="e.g. Dedicated Support Package"
                  value={fee.name}
                  onChange={(e) => update(fee.id, { name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Amount per year ({symbol})</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0"
                  value={fee.annualAmount ?? ""}
                  onChange={(e) => update(fee.id, { annualAmount: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Billing</Label>
                <Select
                  value={isAnnualBilling ? "split" : schedule}
                  disabled={isAnnualBilling}
                  onValueChange={(v) =>
                    update(fee.id, v === "once"
                      ? { billingSchedule: "once", billingMonth: snapMonth(fee.billingMonth, billingFrequency) }
                      : { billingSchedule: "split", billingMonth: undefined })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="split">Split across invoices</SelectItem>
                    <SelectItem value="once">Bill once per year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Billed on</Label>
                <Select
                  value={String(snapMonth(fee.billingMonth, billingFrequency))}
                  disabled={isAnnualBilling || schedule !== "once"}
                  onValueChange={(v) => update(fee.id, { billingMonth: Number(v) })}
                >
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {options.map((o) => (
                      <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove fee"
                onClick={() => onChange(fees.filter((f) => f.id !== fee.id))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        })}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...fees, { id: newId(), name: "", annualAmount: 0, billingSchedule: "split" }])}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add fee
        </Button>
      </CardContent>
    </Card>
  );
}

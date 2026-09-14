import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2 } from "lucide-react";
import type { CustomRecurringAddon } from "@/lib/invoiceCalculations";

interface CustomAnnualFeeEditorProps {
  fees: CustomRecurringAddon[];
  onChange: (fees: CustomRecurringAddon[]) => void;
  currency?: string;
}

const newId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `fee_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

/**
 * Contract-level custom recurring fees. Available on every package: the title
 * and yearly amount are free text, and the calculator splits the annual amount
 * across the contract's billing cycle.
 */
export function CustomAnnualFeeEditor({ fees, onChange, currency = "EUR" }: CustomAnnualFeeEditorProps) {
  const symbol = currency === "USD" ? "$" : "€";

  const update = (id: string, patch: Partial<CustomRecurringAddon>) => {
    onChange(fees.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Custom Annual Fees</CardTitle>
        <CardDescription>
          Recurring yearly charges specific to this contract. The annual amount is split across the billing
          cycle (quarterly billing charges a quarter of it per invoice) and counts as recurring revenue.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {fees.length === 0 && (
          <p className="text-sm text-muted-foreground">No custom annual fees on this contract.</p>
        )}

        {fees.map((fee) => (
          <div key={fee.id} className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-3 items-end">
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
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...fees, { id: newId(), name: "", annualAmount: 0 }])}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add fee
        </Button>
      </CardContent>
    </Card>
  );
}

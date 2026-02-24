import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export type PricingModel =
  | "per_mw_modules"
  | "hybrid_tiered"
  | "capped"
  | "per_site"
  | "site_size_threshold"
  | "per_site_flat"
  | "graduated_mw_tiers"
  | "quantity_tiers"
  | "poc";

export const PRICING_MODEL_OPTIONS: { value: PricingModel; label: string; description: string }[] = [
  { value: "per_mw_modules", label: "Per-MW Modules", description: "Select modules priced per MWp/year" },
  { value: "hybrid_tiered", label: "Hybrid Tiered", description: "Different rates for on-grid vs hybrid sites" },
  { value: "capped", label: "Capped / Flat Fee", description: "Fixed annual/monthly fee with optional MW cap" },
  { value: "per_site", label: "Per-Site", description: "Onboarding fee + annual subscription per site" },
  { value: "site_size_threshold", label: "Site-Size Threshold", description: "Different per-MWp rates above/below a kWp threshold" },
  { value: "per_site_flat", label: "Per-Site Flat", description: "Flat annual fee per site in an asset group" },
  { value: "graduated_mw_tiers", label: "Graduated MW Tiers", description: "Different per-MW rates for MW ranges" },
  { value: "quantity_tiers", label: "Quantity-Based Tiers", description: "Price tiers based on a count (e.g., municipalities)" },
  { value: "poc", label: "POC / Trial", description: "No billing, expiry tracking only" },
];

interface PricingModelSelectorProps {
  value: PricingModel | "";
  onChange: (value: PricingModel) => void;
}

export function PricingModelSelector({ value, onChange }: PricingModelSelectorProps) {
  return (
    <div className="space-y-2">
      <Label>Pricing Model</Label>
      <Select value={value} onValueChange={(v) => onChange(v as PricingModel)}>
        <SelectTrigger>
          <SelectValue placeholder="Select a pricing model" />
        </SelectTrigger>
        <SelectContent>
          {PRICING_MODEL_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              <div className="flex flex-col">
                <span className="font-medium">{opt.label}</span>
                <span className="text-xs text-muted-foreground">{opt.description}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

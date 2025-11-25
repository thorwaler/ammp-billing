import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MinimumChargeTier, SiteChargeFrequency } from "@/data/pricingData";

interface MinimumChargeTierEditorProps {
  tiers: MinimumChargeTier[];
  onTiersChange: (tiers: MinimumChargeTier[]) => void;
  currentMW?: number;
  currencySymbol?: string;
  disabled?: boolean;
  frequency?: SiteChargeFrequency;
}

export function MinimumChargeTierEditor({
  tiers,
  onTiersChange,
  currentMW,
  currencySymbol = "€",
  disabled = false,
  frequency = "annual"
}: MinimumChargeTierEditorProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Find which tier applies to currentMW
  const appliedTierIndex = currentMW !== undefined
    ? tiers.findIndex(tier => 
        currentMW >= tier.minMW && 
        (tier.maxMW === null || currentMW <= tier.maxMW)
      )
    : -1;

  const handleTierChange = (index: number, field: keyof MinimumChargeTier, value: any) => {
    const updatedTiers = [...tiers];
    updatedTiers[index] = {
      ...updatedTiers[index],
      [field]: value
    };
    onTiersChange(updatedTiers);
  };

  const frequencyLabel = frequency === "monthly" ? "per site/month" : "per site/year";

  return (
    <div className="border rounded-md p-4">
      <div className="flex items-center justify-between mb-2">
        <Label className="font-semibold">Minimum Charge Tiers ({frequencyLabel})</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          disabled={disabled}
        >
          {isExpanded ? (
            <>
              <ChevronUp className="h-4 w-4 mr-1" />
              Collapse
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4 mr-1" />
              Expand
            </>
          )}
        </Button>
      </div>

      {!isExpanded && currentMW !== undefined && appliedTierIndex !== -1 && (
        <div className="text-sm text-muted-foreground">
          Current: {tiers[appliedTierIndex].label} - {currencySymbol}{tiers[appliedTierIndex].chargePerSite} {frequencyLabel}
        </div>
      )}

      {isExpanded && (
        <div className="space-y-2 mt-4">
          <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-muted-foreground mb-2">
            <div className="col-span-3">Min MW</div>
            <div className="col-span-3">Max MW</div>
            <div className="col-span-3">Charge/Site</div>
            <div className="col-span-3">Label</div>
          </div>
          {tiers.map((tier, index) => (
            <div 
              key={index} 
              className={`grid grid-cols-12 gap-2 items-center ${
                index === appliedTierIndex ? 'bg-primary/10 p-2 rounded' : ''
              }`}
            >
              <Input
                type="number"
                step="0.01"
                value={tier.minMW}
                onChange={(e) => handleTierChange(index, 'minMW', parseFloat(e.target.value))}
                className="col-span-3 h-8"
                disabled={disabled}
              />
              <Input
                type="number"
                step="0.01"
                value={tier.maxMW ?? ''}
                onChange={(e) => handleTierChange(index, 'maxMW', e.target.value === '' ? null : parseFloat(e.target.value))}
                placeholder="∞"
                className="col-span-3 h-8"
                disabled={disabled}
              />
              <Input
                type="number"
                step="0.01"
                value={tier.chargePerSite}
                onChange={(e) => handleTierChange(index, 'chargePerSite', parseFloat(e.target.value))}
                className="col-span-3 h-8"
                disabled={disabled}
              />
              <Input
                type="text"
                value={tier.label}
                onChange={(e) => handleTierChange(index, 'label', e.target.value)}
                className="col-span-3 h-8"
                disabled={disabled}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

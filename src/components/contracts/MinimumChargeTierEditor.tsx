import { useState } from "react";
import { ChevronDown, ChevronUp, Trash2, Plus } from "lucide-react";
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

  const handleDeleteTier = (index: number) => {
    const updatedTiers = tiers.filter((_, i) => i !== index);
    onTiersChange(updatedTiers);
  };

  const handleAddTier = () => {
    const lastTier = tiers[tiers.length - 1];
    const newTier: MinimumChargeTier = {
      minMW: lastTier ? (lastTier.maxMW ?? lastTier.minMW + 10) : 0,
      maxMW: null,
      chargePerSite: 0,
      label: "New Tier"
    };
    onTiersChange([...tiers, newTier]);
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
          {tiers.length > 0 && (
            <>
              <div className="grid grid-cols-13 gap-2 text-xs font-semibold text-muted-foreground mb-2">
                <div className="col-span-3">Min MW</div>
                <div className="col-span-3">Max MW</div>
                <div className="col-span-3">Charge/Site</div>
                <div className="col-span-3">Label</div>
                <div className="col-span-1"></div>
              </div>
              {tiers.map((tier, index) => (
                <div 
                  key={index} 
                  className={`grid grid-cols-13 gap-2 items-center ${
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="col-span-1 h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleDeleteTier(index)}
                    disabled={disabled}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </>
          )}
          {tiers.length === 0 && (
            <p className="text-sm text-muted-foreground">No tiers defined. The Per-Site Fee will be used.</p>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddTier}
            disabled={disabled}
            className="mt-2"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Tier
          </Button>
        </div>
      )}
    </div>
  );
}

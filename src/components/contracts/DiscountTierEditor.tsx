import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DiscountTier } from "@/data/pricingData";

interface DiscountTierEditorProps {
  tiers: DiscountTier[];
  onTiersChange: (tiers: DiscountTier[]) => void;
  currentMW?: number;
  disabled?: boolean;
}

export function DiscountTierEditor({
  tiers,
  onTiersChange,
  currentMW,
  disabled = false
}: DiscountTierEditorProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Find which tier applies to currentMW
  const appliedTierIndex = currentMW !== undefined
    ? tiers.findIndex(tier => 
        currentMW >= tier.minMW && 
        (tier.maxMW === null || currentMW <= tier.maxMW)
      )
    : -1;

  const handleTierChange = (index: number, field: keyof DiscountTier, value: any) => {
    const updatedTiers = [...tiers];
    updatedTiers[index] = {
      ...updatedTiers[index],
      [field]: value
    };
    onTiersChange(updatedTiers);
  };

  return (
    <div className="border rounded-md p-4">
      <div className="flex items-center justify-between mb-2">
        <Label className="font-semibold">Portfolio Size Discount Tiers</Label>
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
          Current: {tiers[appliedTierIndex].label} - {tiers[appliedTierIndex].discountPercent}% discount
        </div>
      )}

      {isExpanded && (
        <div className="space-y-2 mt-4">
          <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-muted-foreground mb-2">
            <div className="col-span-3">Min MW</div>
            <div className="col-span-3">Max MW</div>
            <div className="col-span-3">Discount %</div>
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
                step="0.1"
                value={tier.discountPercent}
                onChange={(e) => handleTierChange(index, 'discountPercent', parseFloat(e.target.value))}
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

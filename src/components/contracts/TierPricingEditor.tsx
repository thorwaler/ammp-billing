import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { PricingTier } from "@/data/pricingData";

interface TierPricingEditorProps {
  tiers: PricingTier[];
  onTiersChange: (tiers: PricingTier[]) => void;
  currentQuantity?: number;
  currencySymbol?: string;
  disabled?: boolean;
}

export function TierPricingEditor({
  tiers,
  onTiersChange,
  currentQuantity,
  currencySymbol = "€",
  disabled = false
}: TierPricingEditorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Determine which tier is currently applied based on quantity
  const appliedTierIndex = currentQuantity !== undefined 
    ? tiers.findIndex(tier => 
        currentQuantity >= tier.minQuantity && 
        (tier.maxQuantity === null || currentQuantity <= tier.maxQuantity)
      )
    : -1;

  return (
    <div className="space-y-2">
      {/* Header with expand/collapse button */}
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-muted-foreground">Pricing Tiers</Label>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="h-6 text-xs"
          disabled={disabled}
          type="button"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="h-3 w-3 mr-1" />
              Hide Tiers
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3 mr-1" />
              Edit Tiers
            </>
          )}
        </Button>
      </div>

      {/* Tier configuration table */}
      {isExpanded && (
        <div className="border rounded-md overflow-hidden bg-card">
          <div className="bg-muted/50 px-2 py-2 grid grid-cols-4 gap-2 text-xs font-medium border-b">
            <span>Min Sites</span>
            <span>Max Sites</span>
            <span>Price/Site</span>
            <span>Label</span>
          </div>
          
          {tiers.map((tier, index) => (
            <div 
              key={index} 
              className={cn(
                "px-2 py-2 grid grid-cols-4 gap-2 border-t",
                appliedTierIndex === index && "bg-primary/5 border-primary/20"
              )}
            >
              {/* Min Quantity */}
              <Input
                type="number"
                value={tier.minQuantity}
                onChange={(e) => {
                  const newTiers = tiers.map((t, i) => 
                    i === index 
                      ? { ...t, minQuantity: Number(e.target.value) || 0 }
                      : { ...t }
                  );
                  onTiersChange(newTiers);
                }}
                className="h-7 text-xs"
                disabled={disabled}
              />
              
              {/* Max Quantity */}
              <Input
                type="number"
                placeholder="∞"
                value={tier.maxQuantity ?? ''}
                onChange={(e) => {
                  const newTiers = tiers.map((t, i) => 
                    i === index 
                      ? { ...t, maxQuantity: e.target.value ? Number(e.target.value) : null }
                      : { ...t }
                  );
                  onTiersChange(newTiers);
                }}
                className="h-7 text-xs"
                disabled={disabled}
              />
              
              {/* Price Per Unit */}
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">{currencySymbol}</span>
                <Input
                  type="number"
                  step="0.01"
                  value={tier.pricePerUnit}
                  onChange={(e) => {
                    const newTiers = tiers.map((t, i) => 
                      i === index 
                        ? { ...t, pricePerUnit: Number(e.target.value) || 0 }
                        : { ...t }
                    );
                    onTiersChange(newTiers);
                  }}
                  className="h-7 text-xs"
                  disabled={disabled}
                />
              </div>
              
              {/* Label */}
              <Input
                type="text"
                value={tier.label}
                onChange={(e) => {
                  const newTiers = tiers.map((t, i) => 
                    i === index 
                      ? { ...t, label: e.target.value }
                      : { ...t }
                  );
                  onTiersChange(newTiers);
                }}
                className="h-7 text-xs"
                disabled={disabled}
              />
            </div>
          ))}
        </div>
      )}

      {/* Current tier indicator (always visible when collapsed) */}
      {!isExpanded && currentQuantity !== undefined && appliedTierIndex >= 0 && (
        <div className="text-xs bg-muted/50 p-2 rounded border">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Current: {tiers[appliedTierIndex].label}</span>
            <span className="font-medium">{currencySymbol}{tiers[appliedTierIndex].pricePerUnit}/site</span>
          </div>
        </div>
      )}
    </div>
  );
}

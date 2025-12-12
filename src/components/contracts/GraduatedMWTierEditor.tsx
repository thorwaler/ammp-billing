import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GraduatedMWTier } from "@/data/pricingData";

interface GraduatedMWTierEditorProps {
  tiers: GraduatedMWTier[];
  onTiersChange: (tiers: GraduatedMWTier[]) => void;
  currentMW?: number;
  currencySymbol?: string;
  disabled?: boolean;
}

export function GraduatedMWTierEditor({
  tiers,
  onTiersChange,
  currentMW,
  currencySymbol = "€",
  disabled = false
}: GraduatedMWTierEditorProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Calculate breakdown for current MW
  const calculateBreakdown = (mw: number) => {
    const sortedTiers = [...tiers].sort((a, b) => a.minMW - b.minMW);
    let remainingMW = mw;
    const breakdown: { tier: GraduatedMWTier; mwInTier: number; cost: number }[] = [];

    for (const tier of sortedTiers) {
      if (remainingMW <= 0) break;

      const tierStart = tier.minMW;
      const tierEnd = tier.maxMW ?? Infinity;
      const tierCapacity = tierEnd - tierStart;

      const mwInThisTier = Math.min(remainingMW, tierCapacity);
      const cost = mwInThisTier * tier.pricePerMW;

      breakdown.push({ tier, mwInTier: mwInThisTier, cost });
      remainingMW -= mwInThisTier;
    }

    return breakdown;
  };

  const breakdown = currentMW !== undefined ? calculateBreakdown(currentMW) : [];
  const totalCost = breakdown.reduce((sum, b) => sum + b.cost, 0);

  const handleTierChange = (index: number, field: keyof GraduatedMWTier, value: any) => {
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
        <Label className="font-semibold">Graduated MW Pricing Tiers</Label>
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

      {!isExpanded && currentMW !== undefined && breakdown.length > 0 && (
        <div className="text-sm text-muted-foreground space-y-1">
          <div>Total: {currencySymbol}{totalCost.toLocaleString()}/year for {currentMW.toFixed(2)} MW</div>
          <div className="text-xs">
            {breakdown.map((b, i) => (
              <span key={i}>
                {b.mwInTier.toFixed(2)} MW @ {currencySymbol}{b.tier.pricePerMW}/MW
                {i < breakdown.length - 1 ? ' + ' : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {isExpanded && (
        <div className="space-y-2 mt-4">
          <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-muted-foreground mb-2">
            <div className="col-span-3">Min MW</div>
            <div className="col-span-3">Max MW</div>
            <div className="col-span-3">Price/MW</div>
            <div className="col-span-3">Label</div>
          </div>
          {tiers.map((tier, index) => {
            const tierBreakdown = breakdown.find(b => b.tier.minMW === tier.minMW);
            return (
              <div 
                key={index} 
                className={`grid grid-cols-12 gap-2 items-center ${
                  tierBreakdown && tierBreakdown.mwInTier > 0 ? 'bg-primary/10 p-2 rounded' : ''
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
                  value={tier.pricePerMW}
                  onChange={(e) => handleTierChange(index, 'pricePerMW', parseFloat(e.target.value))}
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
            );
          })}

          {currentMW !== undefined && breakdown.length > 0 && (
            <div className="mt-4 p-3 bg-muted rounded-md">
              <div className="text-sm font-medium mb-2">Current Breakdown ({currentMW.toFixed(2)} MW)</div>
              {breakdown.map((b, i) => (
                <div key={i} className="text-sm flex justify-between">
                  <span>{b.tier.label}: {b.mwInTier.toFixed(2)} MW × {currencySymbol}{b.tier.pricePerMW}</span>
                  <span className="font-medium">{currencySymbol}{b.cost.toLocaleString()}</span>
                </div>
              ))}
              <div className="border-t mt-2 pt-2 flex justify-between font-semibold">
                <span>Total Annual</span>
                <span>{currencySymbol}{totalCost.toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

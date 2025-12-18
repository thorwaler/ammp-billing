import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Percent } from "lucide-react";

interface AssetDiscountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: {
    assetId: string;
    assetName: string;
    totalMW: number;
  } | null;
  currentDiscount?: {
    pricingType: 'annual' | 'per_mw';
    price: number;
    note?: string;
  };
  currency: 'EUR' | 'USD';
  onSave: (assetId: string, discount: { pricingType: 'annual' | 'per_mw'; price: number; note?: string } | null) => void;
}

export function AssetDiscountDialog({
  open,
  onOpenChange,
  asset,
  currentDiscount,
  currency,
  onSave
}: AssetDiscountDialogProps) {
  const [enabled, setEnabled] = useState(false);
  const [pricingType, setPricingType] = useState<'annual' | 'per_mw'>('annual');
  const [price, setPrice] = useState<number>(0);
  const [note, setNote] = useState<string>('');

  const currencySymbol = currency === 'EUR' ? '€' : '$';

  // Reset form when asset changes
  useEffect(() => {
    if (asset) {
      if (currentDiscount) {
        setEnabled(true);
        setPricingType(currentDiscount.pricingType);
        setPrice(currentDiscount.price);
        setNote(currentDiscount.note || '');
      } else {
        setEnabled(false);
        setPricingType('annual');
        setPrice(0);
        setNote('');
      }
    }
  }, [asset, currentDiscount]);

  const handleSave = () => {
    if (!asset) return;
    
    if (enabled && price > 0) {
      onSave(asset.assetId, {
        pricingType,
        price,
        note: note || undefined
      });
    } else {
      // Remove discount
      onSave(asset.assetId, null);
    }
    onOpenChange(false);
  };

  const calculatedAnnual = pricingType === 'annual' 
    ? price 
    : price * (asset?.totalMW || 0);

  if (!asset) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Percent className="h-5 w-5 text-primary" />
            Discounted Rate - {asset.assetName}
          </DialogTitle>
          <DialogDescription>
            Set a custom discounted rate for this asset. It will be excluded from normal pricing calculations and billed separately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Asset Info */}
          <div className="p-3 bg-muted rounded-lg">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Asset:</span>
              <span className="font-medium">{asset.assetName}</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-muted-foreground">Capacity:</span>
              <span className="font-medium">{asset.totalMW.toFixed(4)} MW</span>
            </div>
          </div>

          {/* Enable Discount Toggle */}
          <div className="flex items-center justify-between">
            <Label htmlFor="enable-discount" className="font-medium">
              Enable Discounted Rate
            </Label>
            <Switch
              id="enable-discount"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>

          {enabled && (
            <>
              {/* Pricing Type */}
              <div className="space-y-3">
                <Label className="font-medium">Pricing Type</Label>
                <RadioGroup
                  value={pricingType}
                  onValueChange={(value) => setPricingType(value as 'annual' | 'per_mw')}
                  className="grid grid-cols-2 gap-4"
                >
                  <div className={`flex items-center space-x-2 border rounded-lg p-3 cursor-pointer ${pricingType === 'annual' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                    <RadioGroupItem value="annual" id="annual" />
                    <Label htmlFor="annual" className="cursor-pointer flex-1">
                      <div className="font-medium">Annual Fixed</div>
                      <div className="text-xs text-muted-foreground">Fixed yearly fee</div>
                    </Label>
                  </div>
                  <div className={`flex items-center space-x-2 border rounded-lg p-3 cursor-pointer ${pricingType === 'per_mw' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                    <RadioGroupItem value="per_mw" id="per_mw" />
                    <Label htmlFor="per_mw" className="cursor-pointer flex-1">
                      <div className="font-medium">Per MW</div>
                      <div className="text-xs text-muted-foreground">Rate × MW capacity</div>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Price Input */}
              <div className="space-y-2">
                <Label htmlFor="price">
                  {pricingType === 'annual' ? 'Annual Price' : 'Price per MW/year'}
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {currencySymbol}
                  </span>
                  <Input
                    id="price"
                    type="number"
                    min={0}
                    step={0.01}
                    value={price}
                    onChange={(e) => setPrice(Number(e.target.value) || 0)}
                    className="pl-7"
                    placeholder="0.00"
                  />
                </div>
                
                {/* Calculated Preview */}
                {price > 0 && (
                  <div className="text-sm text-muted-foreground">
                    {pricingType === 'per_mw' ? (
                      <span>
                        {currencySymbol}{price}/MW × {asset.totalMW.toFixed(4)} MW = <strong>{currencySymbol}{calculatedAnnual.toFixed(2)}/year</strong>
                      </span>
                    ) : (
                      <span>
                        Annual cost: <strong>{currencySymbol}{price.toFixed(2)}/year</strong>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Note */}
              <div className="space-y-2">
                <Label htmlFor="note">Note (optional)</Label>
                <Textarea
                  id="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g., Special discount per agreement dated..."
                  rows={2}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            {enabled ? 'Save Discount' : 'Remove Discount'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Badge component for displaying discount status
export function DiscountBadge({ 
  pricingType, 
  price, 
  currency 
}: { 
  pricingType: 'annual' | 'per_mw'; 
  price: number; 
  currency: 'EUR' | 'USD';
}) {
  const currencySymbol = currency === 'EUR' ? '€' : '$';
  return (
    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-800">
      <Percent className="h-3 w-3 mr-1" />
      Discounted: {currencySymbol}{price}{pricingType === 'per_mw' ? '/MW' : '/yr'}
    </Badge>
  );
}

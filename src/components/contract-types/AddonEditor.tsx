import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

export interface AddonConfig {
  id: string;
  name: string;
  pricingType: "fixed" | "complexity" | "tiered";
  price?: number;
  lowPrice?: number;
  mediumPrice?: number;
  highPrice?: number;
}

interface AddonEditorProps {
  addons: AddonConfig[];
  onChange: (addons: AddonConfig[]) => void;
}

export function AddonEditor({ addons, onChange }: AddonEditorProps) {
  const addAddon = () => {
    const id = `addon_${Date.now()}`;
    onChange([...addons, { id, name: "", pricingType: "fixed", price: 0 }]);
  };

  const removeAddon = (index: number) => {
    onChange(addons.filter((_, i) => i !== index));
  };

  const updateAddon = (index: number, updates: Partial<AddonConfig>) => {
    const updated = [...addons];
    updated[index] = { ...updated[index], ...updates };
    if (updates.name !== undefined) {
      updated[index].id = updates.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    }
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold">Add-ons</Label>
        <Button type="button" variant="outline" size="sm" onClick={addAddon}>
          <Plus className="h-4 w-4 mr-1" /> Add Add-on
        </Button>
      </div>
      {addons.length === 0 && (
        <p className="text-sm text-muted-foreground">No add-ons defined.</p>
      )}
      <div className="space-y-3">
        {addons.map((addon, i) => (
          <div key={i} className="rounded-md border border-border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Input
                className="flex-1"
                placeholder="Add-on name"
                value={addon.name}
                onChange={(e) => updateAddon(i, { name: e.target.value })}
              />
              <Select
                value={addon.pricingType}
                onValueChange={(v) => updateAddon(i, { pricingType: v as AddonConfig["pricingType"] })}
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixed Price</SelectItem>
                  <SelectItem value="complexity">Complexity</SelectItem>
                  <SelectItem value="tiered">Tiered</SelectItem>
                </SelectContent>
              </Select>
              <Button type="button" variant="ghost" size="icon" onClick={() => removeAddon(i)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
            {addon.pricingType === "fixed" && (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="Price"
                  value={addon.price || ""}
                  onChange={(e) => updateAddon(i, { price: parseFloat(e.target.value) || 0 })}
                  className="w-32"
                />
                <span className="text-xs text-muted-foreground">one-time</span>
              </div>
            )}
            {addon.pricingType === "complexity" && (
              <div className="flex items-center gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Low</Label>
                  <Input type="number" value={addon.lowPrice || ""} onChange={(e) => updateAddon(i, { lowPrice: parseFloat(e.target.value) || 0 })} className="w-24" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Medium</Label>
                  <Input type="number" value={addon.mediumPrice || ""} onChange={(e) => updateAddon(i, { mediumPrice: parseFloat(e.target.value) || 0 })} className="w-24" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">High</Label>
                  <Input type="number" value={addon.highPrice || ""} onChange={(e) => updateAddon(i, { highPrice: parseFloat(e.target.value) || 0 })} className="w-24" />
                </div>
              </div>
            )}
            {addon.pricingType === "tiered" && (
              <p className="text-xs text-muted-foreground">Tiered pricing is configured per-contract when using this template.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

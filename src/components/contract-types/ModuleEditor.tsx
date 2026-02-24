import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";

export interface ModuleConfig {
  id: string;
  name: string;
  price: number;
  available: boolean;
}

interface ModuleEditorProps {
  modules: ModuleConfig[];
  onChange: (modules: ModuleConfig[]) => void;
}

export function ModuleEditor({ modules, onChange }: ModuleEditorProps) {
  const addModule = () => {
    const id = `module_${Date.now()}`;
    onChange([...modules, { id, name: "", price: 0, available: true }]);
  };

  const removeModule = (index: number) => {
    onChange(modules.filter((_, i) => i !== index));
  };

  const updateModule = (index: number, field: keyof ModuleConfig, value: string | number | boolean) => {
    const updated = [...modules];
    updated[index] = { ...updated[index], [field]: value };
    // Auto-generate id from name
    if (field === "name" && typeof value === "string") {
      updated[index].id = value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    }
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold">Modules</Label>
        <Button type="button" variant="outline" size="sm" onClick={addModule}>
          <Plus className="h-4 w-4 mr-1" /> Add Module
        </Button>
      </div>
      {modules.length === 0 && (
        <p className="text-sm text-muted-foreground">No modules defined. Add modules priced per MWp/year.</p>
      )}
      <div className="space-y-2">
        {modules.map((mod, i) => (
          <div key={i} className="flex items-center gap-2 rounded-md border border-border p-3">
            <div className="flex-1">
              <Input
                placeholder="Module name"
                value={mod.name}
                onChange={(e) => updateModule(i, "name", e.target.value)}
              />
            </div>
            <div className="w-32">
              <Input
                type="number"
                placeholder="Price/MWp"
                value={mod.price || ""}
                onChange={(e) => updateModule(i, "price", parseFloat(e.target.value) || 0)}
              />
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">/MWp/yr</span>
            <Button type="button" variant="ghost" size="icon" onClick={() => removeModule(i)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

export interface XeroLineItemConfig {
  [key: string]: {
    description: string;
    accountCode: string;
  };
}

interface XeroMappingEditorProps {
  config: XeroLineItemConfig;
  onChange: (config: XeroLineItemConfig) => void;
}

const DEFAULT_COMPONENTS = [
  { key: "modules", label: "Modules / Base Pricing" },
  { key: "addons", label: "Add-ons" },
  { key: "base_price", label: "Base Monthly Price" },
  { key: "setup_fees", label: "Setup / Onboarding Fees" },
  { key: "retainer", label: "Retainer Hours" },
];

export function XeroMappingEditor({ config, onChange }: XeroMappingEditorProps) {
  const [open, setOpen] = useState(false);

  const updateComponent = (key: string, field: "description" | "accountCode", value: string) => {
    const updated = { ...config };
    if (!updated[key]) updated[key] = { description: "", accountCode: "" };
    updated[key] = { ...updated[key], [field]: value };
    onChange(updated);
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" type="button" className="w-full justify-between px-0 font-semibold text-base">
          Xero Line Item Mapping
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pt-2">
        <p className="text-sm text-muted-foreground">
          Map each cost component to a Xero description and account code. Use 1002 for ARR (recurring) and 1000 for NRR (one-time).
        </p>
        {DEFAULT_COMPONENTS.map((comp) => (
          <div key={comp.key} className="grid grid-cols-[1fr_2fr_100px] gap-2 items-center">
            <Label className="text-sm">{comp.label}</Label>
            <Input
              placeholder="Xero description"
              value={config[comp.key]?.description || ""}
              onChange={(e) => updateComponent(comp.key, "description", e.target.value)}
            />
            <Input
              placeholder="Code"
              value={config[comp.key]?.accountCode || ""}
              onChange={(e) => updateComponent(comp.key, "accountCode", e.target.value)}
            />
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

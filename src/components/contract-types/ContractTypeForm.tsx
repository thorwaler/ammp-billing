import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { PricingModelSelector, type PricingModel } from "./PricingModelSelector";
import { ModuleEditor, type ModuleConfig } from "./ModuleEditor";
import { AddonEditor, type AddonConfig } from "./AddonEditor";
import { XeroMappingEditor, type XeroLineItemConfig } from "./XeroMappingEditor";

export interface ContractTypeFormData {
  name: string;
  slug: string;
  description: string;
  pricing_model: PricingModel | "";
  default_currency: string;
  default_billing_frequency: string;
  force_billing_frequency: boolean;
  default_minimum_annual_value: number;
  modules_config: ModuleConfig[];
  addons_config: AddonConfig[];
  xero_line_items_config: XeroLineItemConfig;
  default_values: Record<string, unknown>;
}

interface ContractTypeFormProps {
  initialData?: ContractTypeFormData;
  onSubmit: (data: ContractTypeFormData) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const emptyFormData: ContractTypeFormData = {
  name: "",
  slug: "",
  description: "",
  pricing_model: "",
  default_currency: "EUR",
  default_billing_frequency: "annual",
  force_billing_frequency: false,
  default_minimum_annual_value: 0,
  modules_config: [],
  addons_config: [],
  xero_line_items_config: {},
  default_values: {},
};

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

const showModulesFor: PricingModel[] = ["per_mw_modules", "hybrid_tiered"];

export function ContractTypeForm({ initialData, onSubmit, onCancel, isLoading }: ContractTypeFormProps) {
  const [form, setForm] = useState<ContractTypeFormData>(initialData || emptyFormData);
  const [autoSlug, setAutoSlug] = useState(!initialData);

  useEffect(() => {
    if (autoSlug) {
      setForm((f) => ({ ...f, slug: generateSlug(f.name) }));
    }
  }, [form.name, autoSlug]);

  const update = <K extends keyof ContractTypeFormData>(key: K, value: ContractTypeFormData[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Info */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Basic Info</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              required
              placeholder="e.g. Partner X Monitoring"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Slug (identifier)</Label>
            <Input
              required
              placeholder="auto-generated"
              value={form.slug}
              onChange={(e) => { setAutoSlug(false); update("slug", e.target.value); }}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Description</Label>
          <Textarea
            placeholder="Shown in the package selector dropdown"
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            rows={2}
          />
        </div>
      </div>

      <Separator />

      {/* Pricing Model */}
      <PricingModelSelector
        value={form.pricing_model}
        onChange={(v) => update("pricing_model", v)}
      />

      <Separator />

      {/* Modules (conditional) */}
      {form.pricing_model && showModulesFor.includes(form.pricing_model) && (
        <>
          <ModuleEditor
            modules={form.modules_config}
            onChange={(m) => update("modules_config", m)}
          />
          <Separator />
        </>
      )}

      {/* Add-ons */}
      <AddonEditor
        addons={form.addons_config}
        onChange={(a) => update("addons_config", a)}
      />

      <Separator />

      {/* Defaults */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Defaults</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Currency</Label>
            <Select value={form.default_currency} onValueChange={(v) => update("default_currency", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="EUR">EUR</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Billing Frequency</Label>
            <Select value={form.default_billing_frequency} onValueChange={(v) => update("default_billing_frequency", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="biannual">Biannual</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Min. Annual Value</Label>
            <Input
              type="number"
              value={form.default_minimum_annual_value || ""}
              onChange={(e) => update("default_minimum_annual_value", parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Switch
            checked={form.force_billing_frequency}
            onCheckedChange={(v) => update("force_billing_frequency", v)}
          />
          <Label>Lock billing frequency (cannot be changed on contract)</Label>
        </div>
      </div>

      <Separator />

      {/* Xero Mapping */}
      <XeroMappingEditor
        config={form.xero_line_items_config}
        onChange={(c) => update("xero_line_items_config", c)}
      />

      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={isLoading || !form.name || !form.pricing_model}>
          {initialData ? "Save Changes" : "Create Contract Type"}
        </Button>
      </div>
    </form>
  );
}

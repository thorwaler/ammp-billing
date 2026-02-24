import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Archive, RotateCcw } from "lucide-react";
import { ContractTypeForm, type ContractTypeFormData } from "@/components/contract-types/ContractTypeForm";
import { PRICING_MODEL_OPTIONS } from "@/components/contract-types/PricingModelSelector";

interface ContractTypeRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  pricing_model: string;
  default_currency: string | null;
  default_billing_frequency: string | null;
  force_billing_frequency: boolean | null;
  default_minimum_annual_value: number | null;
  modules_config: unknown;
  addons_config: unknown;
  xero_line_items_config: unknown;
  default_values: unknown;
  is_active: boolean | null;
  created_at: string;
  user_id: string;
}

export default function ContractTypes() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<ContractTypeRow | null>(null);

  const { data: contractTypes = [], isLoading } = useQuery({
    queryKey: ["contract_types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_types" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ContractTypeRow[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (formData: ContractTypeFormData & { id?: string }) => {
      const payload = {
        name: formData.name,
        slug: formData.slug,
        description: formData.description || null,
        pricing_model: formData.pricing_model,
        default_currency: formData.default_currency,
        default_billing_frequency: formData.default_billing_frequency,
        force_billing_frequency: formData.force_billing_frequency,
        default_minimum_annual_value: formData.default_minimum_annual_value,
        modules_config: formData.modules_config,
        addons_config: formData.addons_config,
        xero_line_items_config: formData.xero_line_items_config,
        default_values: formData.default_values,
        user_id: user?.id,
      };

      if (formData.id) {
        const { error } = await supabase
          .from("contract_types" as any)
          .update(payload as any)
          .eq("id", formData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("contract_types" as any)
          .insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contract_types"] });
      setDialogOpen(false);
      setEditingType(null);
      toast({ title: editingType ? "Contract type updated" : "Contract type created" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("contract_types" as any)
        .update({ is_active } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contract_types"] });
      toast({ title: "Status updated" });
    },
  });

  const openCreate = () => {
    setEditingType(null);
    setDialogOpen(true);
  };

  const openEdit = (ct: ContractTypeRow) => {
    setEditingType(ct);
    setDialogOpen(true);
  };

  const handleSubmit = (data: ContractTypeFormData) => {
    saveMutation.mutate({ ...data, id: editingType?.id });
  };

  const getModelLabel = (model: string) =>
    PRICING_MODEL_OPTIONS.find((o) => o.value === model)?.label || model;

  const toFormData = (ct: ContractTypeRow): ContractTypeFormData => ({
    name: ct.name,
    slug: ct.slug,
    description: ct.description || "",
    pricing_model: ct.pricing_model as any,
    default_currency: ct.default_currency || "EUR",
    default_billing_frequency: ct.default_billing_frequency || "annual",
    force_billing_frequency: ct.force_billing_frequency || false,
    default_minimum_annual_value: ct.default_minimum_annual_value || 0,
    modules_config: (ct.modules_config as any) || [],
    addons_config: (ct.addons_config as any) || [],
    xero_line_items_config: (ct.xero_line_items_config as any) || {},
    default_values: (ct.default_values as any) || {},
  });

  return (
    <Layout>
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Contract Types</h1>
            <p className="text-muted-foreground">Create reusable contract templates with custom pricing models</p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> New Contract Type
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : contractTypes.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <p>No custom contract types yet. Create one to get started.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {contractTypes.map((ct) => (
              <Card key={ct.id} className={ct.is_active === false ? "opacity-60" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-lg">{ct.name}</CardTitle>
                      <Badge variant={ct.is_active !== false ? "default" : "secondary"}>
                        {ct.is_active !== false ? "Active" : "Archived"}
                      </Badge>
                      <Badge variant="outline">{getModelLabel(ct.pricing_model)}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(ct)}>
                        <Pencil className="h-4 w-4 mr-1" /> Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleActiveMutation.mutate({ id: ct.id, is_active: ct.is_active === false })}
                      >
                        {ct.is_active !== false ? (
                          <><Archive className="h-4 w-4 mr-1" /> Archive</>
                        ) : (
                          <><RotateCcw className="h-4 w-4 mr-1" /> Restore</>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-6 text-sm text-muted-foreground">
                    {ct.description && <span>{ct.description}</span>}
                    <span>Slug: <code className="text-xs bg-muted px-1 rounded">{ct.slug}</code></span>
                    <span>Currency: {ct.default_currency || "EUR"}</span>
                    <span>Billing: {ct.default_billing_frequency || "annual"}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingType(null); }}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingType ? "Edit Contract Type" : "New Contract Type"}</DialogTitle>
            </DialogHeader>
            <ContractTypeForm
              initialData={editingType ? toFormData(editingType) : undefined}
              onSubmit={handleSubmit}
              onCancel={() => setDialogOpen(false)}
              isLoading={saveMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

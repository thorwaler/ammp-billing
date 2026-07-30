import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Info, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { buildDuplicateFormValues } from "@/lib/contractFormMapping";
import ContractForm from "@/components/contracts/ContractForm";

interface DuplicateContractDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  currentCustomerId: string;
  onDuplicated?: () => void;
}

export function DuplicateContractDialog({
  open,
  onOpenChange,
  contractId,
  currentCustomerId,
  onDuplicated,
}: DuplicateContractDialogProps) {
  const [targetCustomerId, setTargetCustomerId] = useState<string>(currentCustomerId);

  useEffect(() => {
    if (open) setTargetCustomerId(currentCustomerId);
  }, [open, currentCustomerId]);

  const { data: sourceContract, isLoading: loadingContract } = useQuery({
    queryKey: ["contract-to-duplicate", contractId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("*")
        .eq("id", contractId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: open && !!contractId,
  });

  const { data: customers } = useQuery({
    queryKey: ["customers-for-duplicate"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, mwp_managed")
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const formValues = useMemo(
    () => (sourceContract ? buildDuplicateFormValues(sourceContract) : null),
    [sourceContract]
  );

  const targetCustomer = customers?.find((c) => c.id === targetCustomerId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Duplicate Contract</DialogTitle>
          <DialogDescription>
            Review and adjust the copied settings, then save to create a new contract.
            Nothing is created until you submit.
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm">
            Pricing setup, asset-group filters and package configuration are copied.
            Synced AMMP assets, the contract PDF, amendments and invoice history are
            not — run a sync on the new contract once it is created.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <Label>Customer for the new contract</Label>
          <Select value={targetCustomerId} onValueChange={setTargetCustomerId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a customer" />
            </SelectTrigger>
            <SelectContent>
              {customers?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loadingContract || !formValues ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading contract...
          </div>
        ) : (
          <ContractForm
            key={`${contractId}-${targetCustomerId}`}
            isDuplicating
            existingCustomer={
              targetCustomer
                ? {
                    id: targetCustomer.id,
                    name: targetCustomer.name,
                    mwpManaged: targetCustomer.mwp_managed || 0,
                  }
                : undefined
            }
            existingContract={formValues as any}
            onCancel={() => onOpenChange(false)}
            onComplete={() => {
              toast({
                title: "Contract duplicated",
                description: `New contract created for ${targetCustomer?.name ?? "the selected customer"}.`,
              });
              onOpenChange(false);
              onDuplicated?.();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export default DuplicateContractDialog;

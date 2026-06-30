import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface MoveContractDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  currentCustomerId: string;
  currentCustomerName: string;
  onMoved?: () => void;
}

export function MoveContractDialog({
  open,
  onOpenChange,
  contractId,
  currentCustomerId,
  currentCustomerName,
  onMoved,
}: MoveContractDialogProps) {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [isMoving, setIsMoving] = useState(false);

  const { data: customers, isLoading } = useQuery({
    queryKey: ["customers-for-move", currentCustomerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name")
        .neq("id", currentCustomerId)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const handleMove = async () => {
    if (!selectedCustomerId) return;
    setIsMoving(true);
    try {
      const { error } = await supabase
        .from("contracts")
        .update({ customer_id: selectedCustomerId })
        .eq("id", contractId);
      if (error) throw error;

      const target = customers?.find((c) => c.id === selectedCustomerId);
      toast({
        title: "Contract moved",
        description: `Contract reassigned to ${target?.name ?? "selected customer"}.`,
      });
      onOpenChange(false);
      onMoved?.();
    } catch (e: any) {
      toast({
        title: "Failed to move contract",
        description: e?.message || "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsMoving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Move Contract to Different Customer</DialogTitle>
          <DialogDescription>
            Reassign this contract from <strong>{currentCustomerName}</strong> to
            another customer.
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            All invoices, billing periods, amendments, and sync history will
            follow the contract and now display under the new customer.
            Historical Xero invoices remain linked to the original Xero contact.
          </AlertDescription>
        </Alert>

        <div className="space-y-2 py-2">
          <Label>New customer</Label>
          <Select
            value={selectedCustomerId}
            onValueChange={setSelectedCustomerId}
            disabled={isLoading || isMoving}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={isLoading ? "Loading customers..." : "Select a customer"}
              />
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

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isMoving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleMove}
            disabled={!selectedCustomerId || isMoving}
          >
            {isMoving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Move Contract
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

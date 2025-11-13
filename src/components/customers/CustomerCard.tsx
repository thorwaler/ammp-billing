
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, BarChart, MoreHorizontal, CheckCircle2, AlertCircle } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import CustomerForm from "./CustomerForm";
import ContractForm from "../contracts/ContractForm";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface CustomerCardProps {
  id: string;
  name: string;
  location: string;
  contractValue: string;
  mwpManaged: number;
  status: "active" | "pending" | "inactive";
  addOns: string[];
  joinDate?: string;
  lastInvoiced?: string;
  contractId?: string;
  hasContract: boolean;
  onViewContract?: () => void;
  onViewDetails?: () => void;
  onContractCreated?: () => void;
}

export function CustomerCard({
  id,
  name,
  location,
  contractValue,
  mwpManaged,
  status,
  addOns,
  joinDate,
  lastInvoiced,
  contractId,
  hasContract,
  onViewContract,
  onViewDetails,
  onContractCreated,
}: CustomerCardProps) {
  const [showEditForm, setShowEditForm] = useState(false);
  const [showContractForm, setShowContractForm] = useState(false);

  const handleMarkInactive = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Update customer status
      const { error: customerError } = await supabase
        .from('customers')
        .update({ status: 'inactive' })
        .eq('id', id)
        .eq('user_id', user.id);

      if (customerError) throw customerError;

      // Expire active contract (CASCADE)
      const { error: contractError } = await supabase
        .from('contracts')
        .update({ contract_status: 'expired' })
        .eq('customer_id', id)
        .eq('user_id', user.id)
        .eq('contract_status', 'active');

      if (contractError) throw contractError;

      toast({
        title: "Customer marked inactive",
        description: "Customer and their active contract have been marked inactive.",
      });

      onContractCreated?.();
    } catch (error) {
      console.error('Error marking customer inactive:', error);
      toast({
        title: "Error",
        description: "Failed to update customer status",
        variant: "destructive",
      });
    }
  };

  const handleReactivate = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('customers')
        .update({ status: 'active' })
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: "Customer reactivated",
        description: "Customer is now active. Contract remains expired and must be reactivated separately.",
      });

      onContractCreated?.();
    } catch (error) {
      console.error('Error reactivating customer:', error);
      toast({
        title: "Error",
        description: "Failed to reactivate customer",
        variant: "destructive",
      });
    }
  };

  const formattedJoinDate = joinDate 
    ? new Date(joinDate).toLocaleDateString() 
    : undefined;
  
  const formattedLastInvoiced = lastInvoiced 
    ? new Date(lastInvoiced).toLocaleDateString() 
    : "Not yet invoiced";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <CardTitle className="text-lg">{name}</CardTitle>
          <div className="flex items-center space-x-2">
            <Badge 
              variant={
                status === 'inactive' ? 'outline' : 
                !hasContract ? 'destructive' : 
                'default'
              }
              className={
                status === 'inactive' ? 'bg-gray-600 hover:bg-gray-700 text-white border-gray-600' : 
                !hasContract ? '' : 
                status === 'pending' ? 'bg-yellow-600 hover:bg-yellow-700' :
                'bg-green-600 hover:bg-green-700'
              }
            >
              {status === 'inactive' ? (
                <>
                  <AlertCircle className="mr-1 h-3 w-3" />
                  Inactive Customer
                </>
              ) : !hasContract ? (
                <>
                  <AlertCircle className="mr-1 h-3 w-3" />
                  No Contract
                </>
              ) : status === 'pending' ? (
                <>
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Pending Setup
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Active
                </>
              )}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-background">
                <Dialog open={showEditForm} onOpenChange={setShowEditForm}>
                  <DialogTrigger asChild>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      Edit Customer
                    </DropdownMenuItem>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Edit Customer: {name}</DialogTitle>
                    </DialogHeader>
                    <CustomerForm 
                      onComplete={() => {
                        setShowEditForm(false);
                        onContractCreated?.();
                      }} 
                      existingCustomer={{
                        id,
                        name,
                        location,
                        mwpManaged,
                        status
                      }}
                    />
                  </DialogContent>
                </Dialog>
                <DropdownMenuSeparator />
                {status === 'active' ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                        Mark as Inactive
                      </DropdownMenuItem>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Mark Customer as Inactive</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will mark the customer inactive and expire their active contract. No more invoices will be generated.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleMarkInactive}>
                          Confirm
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                        Reactivate Customer
                      </DropdownMenuItem>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Reactivate Customer</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will reactivate the customer. Their contract will remain expired and must be reactivated separately.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleReactivate}>
                          Confirm
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{location}</p>
        {formattedJoinDate && (
          <p className="text-xs text-muted-foreground">Customer since {formattedJoinDate}</p>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">Contract Value</div>
            <div className="font-medium">{contractValue}</div>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">MWp Managed</div>
            <div className="font-medium">{mwpManaged} MWp</div>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">Last Invoiced</div>
            <div className="font-medium">{formattedLastInvoiced}</div>
          </div>
          {addOns.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Add-ons</div>
              <div className="flex flex-wrap gap-1">
                {addOns.map((addon) => (
                  <Badge key={addon} variant="outline" className="text-xs">
                    {addon}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2 mt-2">
            {hasContract ? (
              <>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="w-full"
                  onClick={onViewContract}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  View Contract
                </Button>
                <Dialog open={showContractForm} onOpenChange={setShowContractForm}>
                  <DialogTrigger asChild>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="w-full"
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Edit Contract: {name}</DialogTitle>
                    </DialogHeader>
                    <ContractForm 
                      existingCustomer={{ id, name, location, mwpManaged }}
                      onComplete={() => {
                        setShowContractForm(false);
                        onContractCreated?.();
                      }}
                    />
                  </DialogContent>
                </Dialog>
              </>
            ) : (
              <Dialog open={showContractForm} onOpenChange={setShowContractForm}>
                <DialogTrigger asChild>
                  <Button size="sm" className="w-full">
                    <FileText className="mr-2 h-4 w-4" />
                    Setup Contract
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Create Contract: {name}</DialogTitle>
                  </DialogHeader>
                  <ContractForm 
                    existingCustomer={{ id, name, location, mwpManaged }}
                    onComplete={() => {
                      setShowContractForm(false);
                      onContractCreated?.();
                    }}
                  />
                </DialogContent>
              </Dialog>
            )}
            <Button 
              size="sm" 
              variant="outline" 
              className="w-full"
              onClick={onViewDetails}
            >
              <BarChart className="mr-2 h-4 w-4" />
              Details
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default CustomerCard;

import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, BarChart, MoreHorizontal, CheckCircle2, AlertCircle, PlusCircle } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import CustomerForm from "./CustomerForm";
import ContractForm from "../contracts/ContractForm";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getModuleById, getAddonById } from "@/data/pricingData";
import { getCustomerDisplayName } from "@/utils/customerUtils";

const getDisplayName = (id: string, isModule: boolean): string => {
  // Special case for Satellite Data API
  if (id === 'satelliteDataAPI') return 'Solcast';
  
  if (isModule) {
    const module = getModuleById(id);
    return module?.name || id;
  } else {
    const addon = getAddonById(id);
    return addon?.name || id;
  }
};

interface CustomerCardProps {
  id: string;
  name: string;
  nickname?: string | null;
  location: string;
  contractValue: string;
  mwpManaged: number;
  status: "active" | "pending" | "inactive";
  modules: string[];
  addOns: string[];
  package?: string;
  joinDate?: string;
  lastInvoiced?: string;
  contractId?: string;
  hasContract: boolean;
  contractCount?: number;
  contracts?: Array<{
    id: string;
    contract_name?: string;
    package: string;
    contract_status: string;
    signed_date?: string;
    period_start?: string;
    period_end?: string;
    company_name?: string;
  }>;
  ammpOrgId?: string;
  ammpAssetIds?: string[];
  ammpCapabilities?: any;
  lastAmmpSync?: string;
  ammpSyncStatus?: string;
  onViewContract?: () => void;
  onViewDetails?: () => void;
  onContractCreated?: () => void;
}

export function CustomerCard({
  id,
  name,
  nickname,
  location,
  contractValue,
  mwpManaged,
  status,
  modules,
  addOns,
  package: packageType,
  joinDate,
  lastInvoiced,
  contractId,
  hasContract,
  contractCount = 1,
  contracts = [],
  ammpOrgId,
  ammpAssetIds,
  ammpCapabilities,
  lastAmmpSync,
  ammpSyncStatus,
  onViewContract,
  onViewDetails,
  onContractCreated,
}: CustomerCardProps) {
  const displayName = getCustomerDisplayName({ name, nickname });
  const navigate = useNavigate();
  const [showEditForm, setShowEditForm] = useState(false);
  const [showContractForm, setShowContractForm] = useState(false);
  const [showAddContractForm, setShowAddContractForm] = useState(false);
  const [showContractSelector, setShowContractSelector] = useState(false);

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
          <div className="flex flex-col">
            <CardTitle className="text-lg">{displayName}</CardTitle>
            {contractCount > 1 && (
              <span className="text-xs text-muted-foreground mt-1">
                {contractCount} contracts
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            {/* POC Badge - shown separately */}
            {packageType === 'poc' && hasContract && (
              <Badge variant="outline" className="bg-purple-600/20 text-purple-400 border-purple-500">
                POC
              </Badge>
            )}
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
                      <DialogTitle>Edit Customer: {displayName}</DialogTitle>
                    </DialogHeader>
                    <CustomerForm 
                      onComplete={() => {
                        setShowEditForm(false);
                        onContractCreated?.();
                      }} 
                      existingCustomer={{
                        id,
                        name,
                        nickname,
                        location,
                        mwpManaged,
                        status,
                        ammp_org_id: ammpOrgId,
                        ammp_asset_ids: ammpAssetIds,
                        ammp_capabilities: ammpCapabilities,
                        last_ammp_sync: lastAmmpSync,
                        ammp_sync_status: ammpSyncStatus,
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
          {ammpOrgId && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">AMMP Sync</div>
              <Badge variant="outline" className="text-xs">
                {lastAmmpSync ? (
                  <>
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    {formatDistanceToNow(new Date(lastAmmpSync), { addSuffix: true })}
                  </>
                ) : (
                  <>
                    <AlertCircle className="mr-1 h-3 w-3" />
                    Not synced
                  </>
                )}
              </Badge>
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">Last Invoiced</div>
            <div className="font-medium">{formattedLastInvoiced}</div>
          </div>
          {(modules.length > 0 || packageType === 'hybrid_tiered') && (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Modules</div>
              <div className="flex flex-wrap gap-1">
                {packageType === 'hybrid_tiered' ? (
                  <>
                    <Badge variant="outline" className="text-xs">
                      Technical Monitoring
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      Hybrid
                    </Badge>
                  </>
                ) : (
                  modules.map((moduleId) => (
                    <Badge key={moduleId} variant="outline" className="text-xs">
                      {getDisplayName(moduleId, true)}
                    </Badge>
                  ))
                )}
              </div>
            </div>
          )}
          {addOns.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Add-ons</div>
              <div className="flex flex-wrap gap-1">
                {addOns.map((addonId) => (
                  <Badge key={addonId} variant="outline" className="text-xs">
                    {getDisplayName(addonId, false)}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 mt-2">
            {hasContract ? (
              <>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => {
                    if (contractCount > 1) {
                      setShowContractSelector(true);
                    } else {
                      onViewContract?.();
                    }
                  }}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  {contractCount > 1 ? 'Contracts' : 'View'}
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={onViewDetails}
                >
                  <BarChart className="mr-2 h-4 w-4" />
                  Details
                </Button>
                <Dialog open={showContractForm} onOpenChange={setShowContractForm}>
                  <DialogTrigger asChild>
                    <Button 
                      size="sm" 
                      variant="outline"
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Edit Contract: {displayName}</DialogTitle>
                    </DialogHeader>
                    <ContractForm 
                      existingCustomer={{ id, name, nickname, location, mwpManaged, ammpOrgId }}
                      onComplete={() => {
                        setShowContractForm(false);
                        onContractCreated?.();
                      }}
                      onCancel={() => setShowContractForm(false)}
                    />
                  </DialogContent>
                </Dialog>
                <Dialog open={showAddContractForm} onOpenChange={setShowAddContractForm}>
                  <DialogTrigger asChild>
                    <Button 
                      size="sm" 
                      variant="outline"
                    >
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Add
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Add New Contract: {displayName}</DialogTitle>
                    </DialogHeader>
                    <ContractForm 
                      existingCustomer={{ id, name, nickname, location, mwpManaged, ammpOrgId }}
                      isNewContract={true}
                      onComplete={() => {
                        setShowAddContractForm(false);
                        onContractCreated?.();
                      }}
                      onCancel={() => setShowAddContractForm(false)}
                    />
                  </DialogContent>
                </Dialog>
              </>
            ) : (
              <>
                <Dialog open={showContractForm} onOpenChange={setShowContractForm}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="col-span-2">
                      <FileText className="mr-2 h-4 w-4" />
                      Setup Contract
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Create Contract: {name}</DialogTitle>
                    </DialogHeader>
                    <ContractForm 
                      existingCustomer={{ id, name, location, mwpManaged, ammpOrgId }}
                      onComplete={() => {
                        setShowContractForm(false);
                        onContractCreated?.();
                      }}
                      onCancel={() => setShowContractForm(false)}
                    />
                  </DialogContent>
                </Dialog>
                <Button 
                  size="sm" 
                  variant="outline"
                  className="col-span-2"
                  onClick={onViewDetails}
                >
                  <BarChart className="mr-2 h-4 w-4" />
                  Details
                </Button>
              </>
            )}
          </div>
          
          {/* Contract Selector Dialog */}
          <Dialog open={showContractSelector} onOpenChange={setShowContractSelector}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Select Contract - {name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                {contracts.map((contract) => (
                  <div 
                    key={contract.id} 
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {contract.contract_name || `${contract.package} Contract`}
                        </span>
                        <Badge 
                          variant={contract.contract_status === 'active' ? 'default' : 'outline'}
                          className={contract.contract_status === 'active' ? 'bg-green-600' : ''}
                        >
                          {contract.contract_status}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground capitalize">
                        Package: {contract.package}
                      </span>
                      {contract.signed_date && (
                        <span className="text-sm text-muted-foreground">
                          Signed: {new Date(contract.signed_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <Button 
                      size="sm" 
                      onClick={() => {
                        navigate(`/contracts/${contract.id}`);
                        setShowContractSelector(false);
                      }}
                    >
                      View
                    </Button>
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}

export default CustomerCard;

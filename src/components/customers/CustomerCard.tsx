
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, BarChart, MoreHorizontal, CheckCircle2, AlertCircle } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import CustomerForm from "./CustomerForm";
import ContractForm from "../contracts/ContractForm";

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
            {hasContract ? (
              <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Active Contract
              </Badge>
            ) : (
              <Badge variant="destructive">
                <AlertCircle className="mr-1 h-3 w-3" />
                No Contract
              </Badge>
            )}
            <Badge
              variant={
                status === "active"
                  ? "default"
                  : status === "pending"
                  ? "outline"
                  : "secondary"
              }
            >
              {status}
            </Badge>
            <Dialog open={showEditForm} onOpenChange={setShowEditForm}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Edit Customer: {name}</DialogTitle>
                </DialogHeader>
                <CustomerForm 
                  onComplete={() => setShowEditForm(false)} 
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
                      existingContractId={contractId}
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

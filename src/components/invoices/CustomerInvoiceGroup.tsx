import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar, FileText, Layers } from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";
import { differenceInDays } from "date-fns";
import { parseDateCET, formatDateCET } from "@/lib/dateUtils";

interface ContractInvoice {
  contractId: string;
  contractName?: string;
  customerId: string;
  customerName: string;
  nextInvoiceDate: string;
  billingFrequency: string;
  currency: string;
  packageType: string;
  estimatedAmount: number | null;
  manualInvoicing?: boolean;
}

interface CustomerInvoiceGroupProps {
  customerId: string;
  customerName: string;
  invoiceDate: string;
  contracts: ContractInvoice[];
  onCreateIndividualInvoice: (contract: ContractInvoice) => void;
  onCreateMergedInvoice: (contracts: ContractInvoice[]) => void;
}

export function CustomerInvoiceGroup({
  customerName,
  invoiceDate,
  contracts,
  onCreateIndividualInvoice,
  onCreateMergedInvoice,
}: CustomerInvoiceGroupProps) {
  const [selectedContracts, setSelectedContracts] = useState<Set<string>>(new Set());
  const { formatCurrency } = useCurrency();
  
  const parsedDate = parseDateCET(invoiceDate);
  const daysUntil = differenceInDays(parsedDate, new Date());
  
  // Calculate total estimated amount
  const totalEstimatedAmount = useMemo(() => {
    return contracts.reduce((sum, c) => sum + (c.estimatedAmount || 0), 0);
  }, [contracts]);
  
  // Get primary currency (most common among contracts)
  const primaryCurrency = useMemo(() => {
    const currencies = contracts.map(c => c.currency);
    const counts = currencies.reduce((acc, cur) => {
      acc[cur] = (acc[cur] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'EUR';
  }, [contracts]);
  
  const currencySymbol = primaryCurrency === 'EUR' ? '€' : '$';
  
  const toggleContract = (contractId: string) => {
    const newSelected = new Set(selectedContracts);
    if (newSelected.has(contractId)) {
      newSelected.delete(contractId);
    } else {
      newSelected.add(contractId);
    }
    setSelectedContracts(newSelected);
  };
  
  const handleMergedInvoice = () => {
    const contractsToMerge = selectedContracts.size > 0
      ? contracts.filter(c => selectedContracts.has(c.contractId))
      : contracts;
    onCreateMergedInvoice(contractsToMerge);
  };
  
  const selectedAmount = useMemo(() => {
    if (selectedContracts.size === 0) return totalEstimatedAmount;
    return contracts
      .filter(c => selectedContracts.has(c.contractId))
      .reduce((sum, c) => sum + (c.estimatedAmount || 0), 0);
  }, [selectedContracts, contracts, totalEstimatedAmount]);
  
  // Determine border color based on urgency
  const getBorderColor = () => {
    if (daysUntil < 0) return "border-l-4 border-l-destructive";
    if (daysUntil <= 3) return "border-l-4 border-l-orange-500";
    if (daysUntil <= 7) return "border-l-4 border-l-yellow-500";
    return "border-l-4 border-l-primary";
  };
  
  const getUrgencyBadge = () => {
    if (daysUntil < 0) return <Badge variant="destructive">Overdue</Badge>;
    if (daysUntil === 0) return <Badge variant="destructive">Due Today</Badge>;
    if (daysUntil <= 3) return <Badge className="bg-orange-500">Due Soon</Badge>;
    if (daysUntil <= 7) return <Badge className="bg-yellow-500 text-foreground">Upcoming</Badge>;
    return <Badge variant="secondary">Scheduled</Badge>;
  };

  // Single contract - show simple card
  if (contracts.length === 1) {
    const contract = contracts[0];
    return (
      <Card className={`${getBorderColor()} hover:shadow-lg transition-shadow`}>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h3 className="font-semibold text-lg">{customerName}</h3>
              {contract.contractName && (
                <p className="text-sm text-muted-foreground">{contract.contractName}</p>
              )}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                <span>{formatDateCET(invoiceDate, "MMM d, yyyy")}</span>
                <span className="text-xs">
                  ({daysUntil < 0 ? `${Math.abs(daysUntil)} days ago` : `in ${daysUntil} days`})
                </span>
              </div>
            </div>
            {getUrgencyBadge()}
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">{contract.packageType}</Badge>
            <Badge variant="outline" className="capitalize">{contract.billingFrequency}</Badge>
            <Badge variant="secondary">{contract.currency}</Badge>
            {contract.manualInvoicing && <Badge className="bg-orange-500">Manual</Badge>}
          </div>
          
          <div className="flex items-center gap-2 text-lg font-semibold">
            {contract.estimatedAmount !== null ? (
              <>
                <span className="text-muted-foreground">{currencySymbol}</span>
                <span>{contract.estimatedAmount.toLocaleString()}</span>
                <span className="text-sm text-muted-foreground font-normal">estimated</span>
              </>
            ) : (
              <span className="text-sm text-muted-foreground font-normal">Check for sites due</span>
            )}
          </div>
          
          <Button onClick={() => onCreateIndividualInvoice(contract)} className="w-full" size="sm">
            <FileText className="h-4 w-4 mr-2" />
            Create Invoice
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Multiple contracts - show grouped card with selection
  return (
    <Card className={`${getBorderColor()} hover:shadow-lg transition-shadow`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-lg">{customerName}</h3>
              <Badge variant="secondary" className="flex items-center gap-1">
                <Layers className="h-3 w-3" />
                {contracts.length} Contracts
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              <span>{formatDateCET(invoiceDate, "MMM d, yyyy")}</span>
              <span className="text-xs">
                ({daysUntil < 0 ? `${Math.abs(daysUntil)} days ago` : `in ${daysUntil} days`})
              </span>
            </div>
          </div>
          {getUrgencyBadge()}
        </div>
        
        <div className="flex items-center gap-2 text-lg font-semibold mt-2">
          <span className="text-muted-foreground">{currencySymbol}</span>
          <span>{totalEstimatedAmount.toLocaleString()}</span>
          <span className="text-sm text-muted-foreground font-normal">total estimated</span>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {/* Contract list with checkboxes */}
        <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
          {contracts.map((contract) => (
            <div 
              key={contract.contractId} 
              className="flex items-center justify-between py-2 border-b last:border-b-0"
            >
              <div className="flex items-center gap-3">
                <Checkbox
                  id={contract.contractId}
                  checked={selectedContracts.has(contract.contractId)}
                  onCheckedChange={() => toggleContract(contract.contractId)}
                />
                <div className="flex-1">
                  <label 
                    htmlFor={contract.contractId}
                    className="text-sm font-medium cursor-pointer"
                  >
                    {contract.contractName || contract.packageType}
                  </label>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="outline" className="text-xs">{contract.packageType}</Badge>
                    <Badge variant="outline" className="text-xs capitalize">{contract.billingFrequency}</Badge>
                    {contract.currency !== primaryCurrency && (
                      <Badge variant="secondary" className="text-xs">{contract.currency}</Badge>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {contract.estimatedAmount !== null 
                    ? `${contract.currency === 'EUR' ? '€' : '$'}${contract.estimatedAmount.toLocaleString()}`
                    : '-'
                  }
                </span>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => onCreateIndividualInvoice(contract)}
                >
                  <FileText className="h-3.5 w-3.5 mr-1" />
                  Invoice
                </Button>
              </div>
            </div>
          ))}
        </div>
        
        {/* Merged invoice button */}
        <Button 
          onClick={handleMergedInvoice} 
          className="w-full" 
          size="sm"
          variant="default"
        >
          <Layers className="h-4 w-4 mr-2" />
          Create Merged Invoice
          {selectedContracts.size > 0 && selectedContracts.size < contracts.length && (
            <span className="ml-1">({selectedContracts.size} selected)</span>
          )}
          {(selectedContracts.size === 0 || selectedContracts.size === contracts.length) && (
            <span className="ml-1 text-muted-foreground">
              ({currencySymbol}{selectedAmount.toLocaleString()})
            </span>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar, FileText, Layers, SkipForward, CheckCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  invoicingType?: 'standard' | 'manual' | 'automated';
}

interface CustomerInvoiceGroupProps {
  customerId: string;
  customerName: string;
  invoiceDate: string;
  contracts: ContractInvoice[];
  onCreateIndividualInvoice: (contract: ContractInvoice) => void;
  onCreateMergedInvoice: (contracts: ContractInvoice[]) => void;
  onSkipInvoice: (contract: ContractInvoice) => void;
  onSkipSelected: (contracts: ContractInvoice[]) => void;
  onMarkAsSent: (contract: ContractInvoice) => void;
}

export function CustomerInvoiceGroup({
  customerName,
  invoiceDate,
  contracts,
  onCreateIndividualInvoice,
  onCreateMergedInvoice,
  onSkipInvoice,
  onSkipSelected,
  onMarkAsSent,
}: CustomerInvoiceGroupProps) {
  const [selectedContracts, setSelectedContracts] = useState<Set<string>>(new Set());
  const [skipDialogOpen, setSkipDialogOpen] = useState(false);
  const [contractsToSkip, setContractsToSkip] = useState<ContractInvoice[]>([]);
  const { formatCurrency } = useCurrency();
  
  const parsedDate = parseDateCET(invoiceDate);
  const daysUntil = differenceInDays(parsedDate, new Date());
  
  // Calculate total estimated amount
  const totalEstimatedAmount = useMemo(() => {
    return contracts.reduce((sum, c) => sum + (c.estimatedAmount || 0), 0);
  }, [contracts]);
  
  // All contracts in a group now have the same currency (grouped by customer + date + currency)
  const groupCurrency = contracts[0]?.currency || 'EUR';
  const currencySymbol = groupCurrency === 'EUR' ? '€' : '$';
  
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
  
  const handleSkipSelected = () => {
    // Determine which contracts to skip
    const toSkip = selectedContracts.size > 0
      ? contracts.filter(c => selectedContracts.has(c.contractId) && c.invoicingType !== 'automated')
      : contracts.filter(c => c.invoicingType !== 'automated');
    
    if (toSkip.length > 0) {
      setContractsToSkip(toSkip);
      setSkipDialogOpen(true);
    }
  };

  const confirmSkip = () => {
    onSkipSelected(contractsToSkip);
    setSkipDialogOpen(false);
    setContractsToSkip([]);
    setSelectedContracts(new Set());
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
            {contract.invoicingType === 'manual' && <Badge className="bg-orange-500">Manual</Badge>}
            {contract.invoicingType === 'automated' && <Badge className="bg-blue-500">Automated</Badge>}
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
          
          {contract.invoicingType === 'automated' ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
              <span>🔄 Auto-managed in Xero</span>
            </div>
          ) : (
            <div className="flex gap-2">
              {contract.invoicingType === 'manual' ? (
                <Button onClick={() => onMarkAsSent(contract)} className="flex-1" size="sm" variant="secondary">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Mark as Sent
                </Button>
              ) : (
                <Button onClick={() => onCreateIndividualInvoice(contract)} className="flex-1" size="sm">
                  <FileText className="h-4 w-4 mr-2" />
                  Create Invoice
                </Button>
              )}
              <Button onClick={() => onSkipInvoice(contract)} size="sm" variant="outline" title="Skip to next period">
                <SkipForward className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Multiple contracts - show grouped card with compact horizontal table
  return (
    <Card className={`${getBorderColor()} hover:shadow-lg transition-shadow`}>
      {/* Compact header row */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold">{customerName}</h3>
          <Badge variant="secondary" className="text-xs">
            <Layers className="h-3 w-3 mr-1" />
            {contracts.length}
          </Badge>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            <span>{formatDateCET(invoiceDate, "MMM d, yyyy")}</span>
          </div>
          {getUrgencyBadge()}
        </div>
        <div className="font-semibold">
          {currencySymbol}{totalEstimatedAmount.toLocaleString()}
        </div>
      </div>
      
      {/* Compact contract table */}
      <div className="divide-y">
        {contracts.map((contract) => (
          <div 
            key={contract.contractId} 
            className="flex items-center gap-3 px-4 py-2 hover:bg-muted/30"
          >
            <Checkbox
              id={contract.contractId}
              checked={selectedContracts.has(contract.contractId)}
              onCheckedChange={() => toggleContract(contract.contractId)}
            />
            <span className="font-medium min-w-0 truncate flex-1">
              {contract.contractName || contract.packageType}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <Badge variant="outline" className="text-xs">{contract.packageType}</Badge>
              <Badge variant="outline" className="text-xs capitalize">{contract.billingFrequency}</Badge>
              {contract.invoicingType === 'manual' && (
                <Badge className="bg-orange-500 text-xs">Manual</Badge>
              )}
              {contract.invoicingType === 'automated' && (
                <Badge className="bg-blue-500 text-xs">Automated</Badge>
              )}
            </div>
            <span className="font-semibold w-24 text-right shrink-0">
              {contract.estimatedAmount !== null 
                ? `${contract.currency === 'EUR' ? '€' : '$'}${contract.estimatedAmount.toLocaleString()}`
                : '-'
              }
            </span>
            <div className="flex gap-1 shrink-0">
              {contract.invoicingType === 'automated' ? (
                <span className="text-xs text-muted-foreground px-2">Auto</span>
              ) : contract.invoicingType === 'manual' ? (
                <Button variant="secondary" size="sm" onClick={() => onMarkAsSent(contract)}>
                  Mark Sent
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => onCreateIndividualInvoice(contract)}>
                  Invoice
                </Button>
              )}
              {contract.invoicingType !== 'automated' && (
                <Button variant="ghost" size="sm" onClick={() => onSkipInvoice(contract)} title="Skip to next period">
                  <SkipForward className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
      
      {/* Merged invoice footer */}
      <div className="px-4 py-3 border-t bg-muted/20 flex gap-2">
        <Button 
          onClick={handleMergedInvoice} 
          className="flex-1" 
          size="sm"
        >
          <Layers className="h-4 w-4 mr-2" />
          Create Merged Invoice
          {selectedContracts.size > 0 && selectedContracts.size < contracts.length 
            ? ` (${selectedContracts.size} selected)`
            : ` (${currencySymbol}${selectedAmount.toLocaleString()})`
          }
        </Button>
        <Button 
          onClick={handleSkipSelected}
          size="sm"
          variant="outline"
          title="Skip selected contracts to next period"
        >
          <SkipForward className="h-4 w-4 mr-2" />
          Skip {selectedContracts.size > 0 ? `(${selectedContracts.size})` : 'All'}
        </Button>
      </div>

      {/* Skip Confirmation Dialog */}
      <AlertDialog open={skipDialogOpen} onOpenChange={setSkipDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Skip {contractsToSkip.length} Invoice{contractsToSkip.length !== 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  This will advance the following contract{contractsToSkip.length !== 1 ? 's' : ''} to their next billing period without creating invoices:
                </p>
                <ul className="list-disc list-inside text-sm space-y-1 mt-2">
                  {contractsToSkip.map(c => (
                    <li key={c.contractId}>
                      {c.contractName || c.packageType} ({c.billingFrequency})
                    </li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSkip}>
              Skip {contractsToSkip.length} Invoice{contractsToSkip.length !== 1 ? 's' : ''}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Calendar, DollarSign } from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";
import { format, differenceInDays } from "date-fns";

interface InvoiceCardProps {
  contractId: string;
  customerName: string;
  nextInvoiceDate: string;
  billingFrequency: string;
  currency?: string;
  packageType: string;
  estimatedAmount: number | null;
  manualInvoicing?: boolean;
  onCreateInvoice: () => void;
}

export function InvoiceCard({
  customerName,
  nextInvoiceDate,
  billingFrequency,
  currency = 'USD',
  packageType,
  estimatedAmount,
  manualInvoicing = false,
  onCreateInvoice,
}: InvoiceCardProps) {
  const { formatCurrency } = useCurrency();
  const currencySymbol = currency === 'EUR' ? '€' : '$';
  const invoiceDate = new Date(nextInvoiceDate);
  const daysUntil = differenceInDays(invoiceDate, new Date());
  
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
  
  return (
    <Card className={`${getBorderColor()} hover:shadow-lg transition-shadow`}>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h3 className="font-semibold text-lg">{customerName}</h3>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              <span>{format(invoiceDate, "MMM d, yyyy")}</span>
              <span className="text-xs">
                ({daysUntil < 0 ? `${Math.abs(daysUntil)} days ago` : `in ${daysUntil} days`})
              </span>
            </div>
          </div>
          {getUrgencyBadge()}
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline">{packageType}</Badge>
          <Badge variant="outline" className="capitalize">{billingFrequency}</Badge>
          <Badge variant="secondary">{currency}</Badge>
          {manualInvoicing && <Badge className="bg-orange-500">Manual</Badge>}
        </div>
        
        <div className="flex items-center gap-2 text-lg font-semibold">
          {estimatedAmount !== null ? (
            <>
              <span className="text-muted-foreground">{currencySymbol}</span>
              <span>{estimatedAmount.toLocaleString()}</span>
              <span className="text-sm text-muted-foreground font-normal">estimated</span>
            </>
          ) : (
            <span className="text-sm text-muted-foreground font-normal">Check for sites due</span>
          )}
        </div>
        
        <Button onClick={onCreateInvoice} className="w-full" size="sm">
          <FileText className="h-4 w-4 mr-2" />
          Create Invoice
        </Button>
      </CardContent>
    </Card>
  );
}

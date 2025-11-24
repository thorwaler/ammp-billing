import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ExternalLink } from "lucide-react";

interface InvoiceDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: {
    id: string;
    invoice_date: string;
    customer: {
      name: string;
    };
    invoice_amount: number;
    billing_frequency: string;
    xero_invoice_id: string | null;
    currency: string;
    mw_managed: number;
    total_mw: number;
    mw_change: number;
    modules_data: any;
    addons_data: any;
  };
}

export function InvoiceDetailsDialog({
  open,
  onOpenChange,
  invoice,
}: InvoiceDetailsDialogProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: invoice.currency || 'EUR',
    }).format(amount);
  };

  const modules = Array.isArray(invoice.modules_data) ? invoice.modules_data : [];
  const addons = Array.isArray(invoice.addons_data) ? invoice.addons_data : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Invoice Details</DialogTitle>
          <DialogDescription>
            Invoice from {format(new Date(invoice.invoice_date), 'MMMM dd, yyyy')}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[calc(90vh-120px)]">
          <div className="space-y-6 pr-4">
            {/* Customer Info */}
            <div>
              <h3 className="font-semibold mb-2">Customer</h3>
              <p className="text-lg">{invoice.customer.name}</p>
            </div>

            <Separator />

            {/* Invoice Summary */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Billing Frequency</p>
                <p className="font-medium capitalize">{invoice.billing_frequency}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Currency</p>
                <p className="font-medium">{invoice.currency}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">MW Managed</p>
                <p className="font-medium">{invoice.mw_managed} MW</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total MW</p>
                <p className="font-medium">{invoice.total_mw} MW</p>
              </div>
              {invoice.mw_change !== 0 && (
                <div>
                  <p className="text-sm text-muted-foreground">MW Change</p>
                  <p className="font-medium">
                    {invoice.mw_change > 0 ? '+' : ''}{invoice.mw_change} MW
                  </p>
                </div>
              )}
            </div>

            <Separator />

            {/* Xero Status */}
            <div>
              <h3 className="font-semibold mb-2">Xero Integration</h3>
              {invoice.xero_invoice_id ? (
                <div className="flex items-center gap-2">
                  <Badge variant="default">Sent to Xero</Badge>
                  <a 
                    href={`https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${invoice.xero_invoice_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                  >
                    View in Xero <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              ) : (
                <Badge variant="secondary">Not sent to Xero</Badge>
              )}
            </div>

            <Separator />

            {/* Line Items */}
            <div>
              <h3 className="font-semibold mb-3">Line Items</h3>
              <div className="space-y-3">
                {modules.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">Modules</p>
                    <div className="space-y-2">
                      {modules.map((module: any, index: number) => (
                        <div key={index} className="flex justify-between items-center py-2 px-3 bg-muted/50 rounded">
                          <span>{module.name}</span>
                          <span className="font-medium">{formatCurrency(module.cost || 0)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {addons.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">Add-ons</p>
                    <div className="space-y-2">
                      {addons.map((addon: any, index: number) => (
                        <div key={index} className="flex justify-between items-center py-2 px-3 bg-muted/50 rounded">
                          <div>
                            <p>{addon.name}</p>
                            {addon.quantity > 1 && (
                              <p className="text-sm text-muted-foreground">Quantity: {addon.quantity}</p>
                            )}
                          </div>
                          <span className="font-medium">{formatCurrency(addon.cost || 0)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Total */}
            <div className="flex justify-between items-center text-lg font-bold">
              <span>Total Amount</span>
              <span>{formatCurrency(invoice.invoice_amount)}</span>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

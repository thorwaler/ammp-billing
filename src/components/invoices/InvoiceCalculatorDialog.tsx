import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InvoiceCalculator } from "@/components/dashboard/InvoiceCalculator";
import { ScrollArea } from "@/components/ui/scroll-area";

interface InvoiceCalculatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedCustomerId?: string;
  prefilledDate?: Date;
  onInvoiceCreated?: () => void;
}

export function InvoiceCalculatorDialog({
  open,
  onOpenChange,
  preselectedCustomerId,
  prefilledDate,
  onInvoiceCreated,
}: InvoiceCalculatorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle>Invoice Calculator</DialogTitle>
          <DialogDescription>
            Calculate and create customer invoices based on contract and usage metrics
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[calc(90vh-80px)] px-6 pb-6">
          <InvoiceCalculator
            preselectedCustomerId={preselectedCustomerId}
            prefilledDate={prefilledDate}
            onInvoiceCreated={() => {
              onInvoiceCreated?.();
              onOpenChange(false);
            }}
          />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

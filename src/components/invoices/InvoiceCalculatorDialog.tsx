import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InvoiceCalculator } from "@/components/dashboard/InvoiceCalculator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SupportDocument } from "@/components/invoices/SupportDocument";
import { SupportDocumentDownloadDialog } from "@/components/invoices/SupportDocumentDownloadDialog";

interface InvoiceCalculatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedCustomerId?: string;
  preselectedContractId?: string;
  prefilledDate?: Date;
  onInvoiceCreated?: () => void;
}

export function InvoiceCalculatorDialog({
  open,
  onOpenChange,
  preselectedCustomerId,
  preselectedContractId,
  prefilledDate,
  onInvoiceCreated,
}: InvoiceCalculatorDialogProps) {
  const [supportDocumentData, setSupportDocumentData] = useState<any>(null);
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);

  const handleSupportDocumentReady = (data: any) => {
    setSupportDocumentData(data);
    setDownloadDialogOpen(true);
  };

  return (
    <>
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
              preselectedContractId={preselectedContractId}
              prefilledDate={prefilledDate}
              onInvoiceCreated={() => {
                onInvoiceCreated?.();
                // Don't close immediately - let download dialog show first
              }}
              onSupportDocumentReady={handleSupportDocumentReady}
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Hidden support document for PDF export */}
      {supportDocumentData && (
        <div className="hidden">
          <div id="support-document-preview">
            <SupportDocument data={supportDocumentData} />
          </div>
        </div>
      )}

      {/* Support Document Download Dialog - rendered outside main dialog */}
      {supportDocumentData && (
        <SupportDocumentDownloadDialog
          open={downloadDialogOpen}
          onOpenChange={setDownloadDialogOpen}
          documentData={supportDocumentData}
          customerName={supportDocumentData.customerName}
          invoicePeriod={supportDocumentData.invoicePeriod}
        />
      )}
    </>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { UpcomingInvoicesList } from "@/components/invoices/UpcomingInvoicesList";
import { InvoiceCalculatorDialog } from "@/components/invoices/InvoiceCalculatorDialog";
import { Button } from "@/components/ui/button";
import { FileText, Calculator, Plus, History } from "lucide-react";

interface UpcomingInvoice {
  customerId: string;
  customerName: string;
  nextInvoiceDate: string;
  billingFrequency: string;
  packageType: string;
  mwpManaged: number;
  modules: any[];
  addons: any[];
  minimumCharge: number;
  customPricing: any;
}

const InvoiceCreator = () => {
  const navigate = useNavigate();
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<UpcomingInvoice | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleCreateInvoice = (invoice: UpcomingInvoice) => {
    setSelectedInvoice(invoice);
    setCalculatorOpen(true);
  };

  const handleOpenBlankCalculator = () => {
    setSelectedInvoice(null);
    setCalculatorOpen(true);
  };

  const handleInvoiceCreated = () => {
    setRefreshTrigger(prev => prev + 1);
    setSelectedInvoice(null);
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        {/* Header Section */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <FileText className="h-8 w-8 text-primary" />
              Invoice Creator
            </h1>
            <p className="text-muted-foreground mt-1">
              Create and manage customer invoices based on contracts and usage
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => navigate('/invoice-history')} variant="outline" size="sm">
              <History className="h-4 w-4 mr-2" />
              History
            </Button>
            <Button onClick={handleOpenBlankCalculator} variant="outline" size="sm">
              <Calculator className="h-4 w-4 mr-2" />
              Calculator
            </Button>
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-between bg-muted/50 p-4 rounded-lg border">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Upcoming Invoices</h2>
          </div>
          <Button onClick={handleOpenBlankCalculator} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Create Manual Invoice
          </Button>
        </div>

        {/* Upcoming Invoices Grid */}
        <UpcomingInvoicesList 
          onCreateInvoice={handleCreateInvoice}
          refreshTrigger={refreshTrigger}
        />

        {/* Calculator Dialog */}
        <InvoiceCalculatorDialog
          open={calculatorOpen}
          onOpenChange={setCalculatorOpen}
          preselectedCustomerId={selectedInvoice?.customerId}
          prefilledDate={selectedInvoice ? new Date(selectedInvoice.nextInvoiceDate) : undefined}
          onInvoiceCreated={handleInvoiceCreated}
        />
      </div>
    </Layout>
  );
};

export default InvoiceCreator;

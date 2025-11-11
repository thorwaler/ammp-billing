
import Layout from "@/components/layout/Layout";
import InvoiceCalculator from "@/components/dashboard/InvoiceCalculator";
import { Calculator as CalculatorIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useCurrency } from "@/contexts/CurrencyContext";

const Calculator = () => {
  const { formatCurrency } = useCurrency();
  
  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center">
            <CalculatorIcon className="h-8 w-8 mr-2 text-ammp-blue" />
            Invoice Calculator
          </h1>
          <p className="text-muted-foreground mt-1">
            Calculate customer invoices based on contract and usage metrics
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <InvoiceCalculator />
          
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <h2 className="text-xl font-semibold">Calculating Invoices</h2>
                <p className="text-sm text-muted-foreground">
                  Use the calculator to generate accurate invoices for your customers based on:
                </p>
                <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5">
                  <li>New systems onboarded (MWp)</li>
                  <li>Add-on services purchased</li>
                  <li>Total MW under management</li>
                </ul>
                
                <h3 className="text-lg font-medium mt-6">Pricing Explanation</h3>
                <div className="space-y-2 text-sm">
                  <p className="flex justify-between">
                    <span>Base price per MWp:</span>
                    <span className="font-medium">{formatCurrency(500)}</span>
                  </p>
                  <p className="flex justify-between">
                    <span>Add-on price per service:</span>
                    <span className="font-medium">{formatCurrency(250)}</span>
                  </p>
                  <p className="flex justify-between">
                    <span>MW management fee per MW:</span>
                    <span className="font-medium">{formatCurrency(100)}</span>
                  </p>
                </div>
                
                <p className="text-sm text-muted-foreground mt-4">
                  After calculating, you can send the invoice data directly to Xero for processing.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default Calculator;

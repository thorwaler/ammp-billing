
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Calculator, Send } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CalculationResult {
  basePrice: number;
  addOnPrice: number;
  mwManagement: number;
  totalPrice: number;
}

export function InvoiceCalculator() {
  const [customer, setCustomer] = useState("");
  const [mwpValue, setMwpValue] = useState<number | "">("");
  const [addOns, setAddOns] = useState<string[]>([]);
  const [mwManaged, setMwManaged] = useState<number | "">("");
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [showResult, setShowResult] = useState(false);

  const handleCalculate = () => {
    if (!customer || mwpValue === "" || mwManaged === "") {
      toast({
        title: "Missing information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    // Simple calculation based on inputs
    const basePrice = Number(mwpValue) * 500; // $500 per MWp
    const addOnPrice = addOns.length * 250; // $250 per add-on
    const mwManagementPrice = Number(mwManaged) * 100; // $100 per MW managed
    const total = basePrice + addOnPrice + mwManagementPrice;

    setResult({
      basePrice,
      addOnPrice,
      mwManagement: mwManagementPrice,
      totalPrice: total,
    });
    
    setShowResult(true);
  };

  const handleSendToXero = () => {
    if (!result) return;
    
    toast({
      title: "Invoice data ready for Xero",
      description: "The invoice data has been prepared for Xero integration.",
    });
    
    // Reset form after "sending"
    setTimeout(() => {
      setCustomer("");
      setMwpValue("");
      setAddOns([]);
      setMwManaged("");
      setResult(null);
      setShowResult(false);
    }, 2000);
  };

  const handleAddOnChange = (value: string) => {
    setAddOns((prev) => {
      if (prev.includes(value)) {
        return prev.filter((item) => item !== value);
      } else {
        return [...prev, value];
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <Calculator className="h-5 w-5 text-ammp-blue" />
          Invoice Calculator
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="customer">Customer</Label>
            <Select value={customer} onValueChange={setCustomer}>
              <SelectTrigger id="customer">
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="solar-universe">Solar Universe Inc.</SelectItem>
                <SelectItem value="green-power">GreenPower Systems</SelectItem>
                <SelectItem value="solaris">Solaris Energy</SelectItem>
                <SelectItem value="sunpeak">SunPeak Solar</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="mwp-value">New Systems MWp</Label>
            <Input
              id="mwp-value"
              type="number"
              placeholder="Enter MWp value"
              min={0}
              step={0.1}
              value={mwpValue}
              onChange={(e) => setMwpValue(e.target.value ? Number(e.target.value) : "")}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="add-ons">Add-ons Purchased</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={addOns.includes("monitoring") ? "default" : "outline"}
                size="sm"
                onClick={() => handleAddOnChange("monitoring")}
                className="justify-start"
              >
                Monitoring
              </Button>
              <Button
                type="button"
                variant={addOns.includes("analytics") ? "default" : "outline"}
                size="sm"
                onClick={() => handleAddOnChange("analytics")}
                className="justify-start"
              >
                Analytics
              </Button>
              <Button
                type="button"
                variant={addOns.includes("reporting") ? "default" : "outline"}
                size="sm"
                onClick={() => handleAddOnChange("reporting")}
                className="justify-start"
              >
                Reporting
              </Button>
              <Button
                type="button"
                variant={addOns.includes("maintenance") ? "default" : "outline"}
                size="sm"
                onClick={() => handleAddOnChange("maintenance")}
                className="justify-start"
              >
                Maintenance
              </Button>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="mw-managed">Total MW Under Management</Label>
            <Input
              id="mw-managed"
              type="number"
              placeholder="Enter MW value"
              min={0}
              step={0.1}
              value={mwManaged}
              onChange={(e) => setMwManaged(e.target.value ? Number(e.target.value) : "")}
            />
          </div>
          
          <Button className="w-full" onClick={handleCalculate}>
            Calculate Invoice
          </Button>
        </div>
        
        {showResult && result && (
          <div className="mt-6 border rounded-lg p-4">
            <h3 className="font-medium mb-2">Invoice Calculation Result</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>New Systems Cost:</span>
                <span>${result.basePrice.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Add-ons Cost:</span>
                <span>${result.addOnPrice.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>MW Management Cost:</span>
                <span>${result.mwManagement.toLocaleString()}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-medium">
                <span>Total Invoice:</span>
                <span>${result.totalPrice.toLocaleString()}</span>
              </div>
            </div>
            <Button 
              className="w-full mt-4" 
              variant="outline" 
              onClick={handleSendToXero}
            >
              <Send className="mr-2 h-4 w-4" />
              Send to Xero
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default InvoiceCalculator;

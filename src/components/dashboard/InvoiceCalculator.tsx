
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Calculator, Send, ArrowRight, CalendarIcon, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { useCurrency } from "@/contexts/CurrencyContext";
import { supabase } from "@/integrations/supabase/client";

interface Module {
  id: string;
  name: string;
  price: number;
  selected: boolean;
}

interface Addon {
  id: string;
  name: string;
  module: string;
  price?: number;
  complexityPricing?: boolean;
  lowPrice?: number;
  mediumPrice?: number;
  highPrice?: number;
  complexity?: 'low' | 'medium' | 'high';
  selected: boolean;
  requiresPro?: boolean;
}

interface Customer {
  id: string;
  name: string;
  package: 'starter' | 'pro' | 'custom';
  mwManaged: number;
  sites: number;
  modules: string[];
  addons: string[];
  minimumCharge?: number;
  customPricing?: {[key: string]: number};
}

interface CalculationResult {
  moduleCosts: {
    moduleId: string;
    moduleName: string;
    cost: number;
  }[];
  addonCosts: {
    addonId: string;
    addonName: string;
    cost: number;
  }[];
  starterPackageCost: number;
  minimumCharges: number;
  totalMWCost: number;
  totalPrice: number;
}


const defaultModules: Module[] = [
  { id: "technicalMonitoring", name: "Technical Monitoring", price: 1000, selected: false },
  { id: "energySavingsHub", name: "Energy Savings Hub", price: 500, selected: false },
  { id: "stakeholderPortal", name: "Stakeholder Portal", price: 250, selected: false },
  { id: "control", name: "Control", price: 500, selected: false },
];

const defaultAddons: Addon[] = [
  // Technical Monitoring Addons
  { 
    id: "customKPIs", 
    name: "Custom KPIs", 
    module: "technicalMonitoring", 
    complexityPricing: true,
    lowPrice: 200,
    mediumPrice: 1500,
    highPrice: 10000,
    selected: false
  },
  { 
    id: "customAPIIntegration", 
    name: "Custom API Integration", 
    module: "technicalMonitoring", 
    price: 3500,
    selected: false
  },
  { 
    id: "satelliteDataAPI", 
    name: "Satellite Data API Access", 
    module: "technicalMonitoring", 
    price: 6,
    selected: false
  },
  { 
    id: "dataLoggerSetup", 
    name: "Data Logger Setup", 
    module: "technicalMonitoring", 
    complexityPricing: true,
    lowPrice: 1000,
    mediumPrice: 2500,
    highPrice: 5000,
    selected: false
  },
  { 
    id: "tmCustomDashboards", 
    name: "Custom Dashboards", 
    module: "technicalMonitoring", 
    price: 1000,
    selected: false,
    requiresPro: true
  },
  { 
    id: "tmCustomReports", 
    name: "Custom Reports", 
    module: "technicalMonitoring", 
    price: 1500,
    selected: false,
    requiresPro: true
  },
  { 
    id: "tmCustomAlerts", 
    name: "Custom Alerts", 
    module: "technicalMonitoring", 
    price: 150,
    selected: false,
    requiresPro: true
  },
  
  // Energy Savings Hub Addons
  { 
    id: "eshCustomDashboard", 
    name: "Custom Dashboard", 
    module: "energySavingsHub", 
    price: 1000,
    selected: false
  },
  { 
    id: "eshCustomReport", 
    name: "Custom Report", 
    module: "energySavingsHub", 
    price: 1500,
    selected: false
  },
  { 
    id: "eshCustomKPIs", 
    name: "Custom KPIs", 
    module: "energySavingsHub", 
    complexityPricing: true,
    lowPrice: 200,
    mediumPrice: 1500,
    highPrice: 10000,
    selected: false
  },
  
  // Stakeholder Portal Addons
  { 
    id: "spCustomDashboard", 
    name: "Custom Dashboard", 
    module: "stakeholderPortal", 
    price: 1000,
    selected: false
  },
  { 
    id: "spCustomReport", 
    name: "Custom Report", 
    module: "stakeholderPortal", 
    price: 1500,
    selected: false
  },
];

export function InvoiceCalculator() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customer, setCustomer] = useState("");
  const [newSystems, setNewSystems] = useState<number | "">("");
  const [mwManaged, setMwManaged] = useState<number | "">("");
  const [sites, setSites] = useState<number | "">("");
  const [sitesUnderThreshold, setSitesUnderThreshold] = useState<number | "">("");
  const [modules, setModules] = useState<Module[]>(defaultModules);
  const [addons, setAddons] = useState<Addon[]>(defaultAddons);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [billingFrequency, setBillingFrequency] = useState<"quarterly" | "biannual" | "annual">("annual");
  const [invoiceDate, setInvoiceDate] = useState<Date | undefined>(new Date());
  const [isSending, setIsSending] = useState(false);
  const { formatCurrency } = useCurrency();

  // Load customers from database on mount
  useEffect(() => {
    const loadCustomers = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('customers')
        .select(`
          id,
          name,
          mwp_managed,
          contracts (
            id,
            package,
            modules,
            addons,
            custom_pricing,
            minimum_charge
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'active');

      if (error) {
        console.error('Error loading customers:', error);
        return;
      }

      // Transform to Customer format
      const transformedCustomers: Customer[] = (data || [])
        .filter(c => c.contracts && c.contracts.length > 0)
        .map(c => {
          const contract = c.contracts[0];
          const modules = Array.isArray(contract.modules) ? contract.modules as string[] : [];
          const addons = Array.isArray(contract.addons) ? (contract.addons as any[]).map((a: any) => a.id || a) : [];
          const customPricing = typeof contract.custom_pricing === 'object' && contract.custom_pricing !== null ? contract.custom_pricing as {[key: string]: number} : {};
          
          return {
            id: c.id,
            name: c.name,
            package: contract.package as 'starter' | 'pro' | 'custom',
            mwManaged: Number(c.mwp_managed) || 0,
            sites: 0,
            modules,
            addons,
            minimumCharge: Number(contract.minimum_charge) || 0,
            customPricing
          };
        });

      setCustomers(transformedCustomers);
    };

    loadCustomers();
  }, []);

  // Update modules and addons when a customer is selected
  useEffect(() => {
    if (customer) {
      const customerData = customers.find((c) => c.id === customer) || null;
      setSelectedCustomer(customerData);
      
      if (customerData) {
        // Set initial MW managed
        setMwManaged(customerData.mwManaged);
        setSites(customerData.sites);
        
        // Apply custom pricing to modules if available
        const updatedModules = defaultModules.map(module => {
          const customPrice = customerData.customPricing?.[module.id];
          return {
            ...module,
            price: customPrice !== undefined ? customPrice : module.price,
            selected: customerData.modules.includes(module.id)
          };
        });
        setModules(updatedModules);
        
        // Update addons based on customer selection
        const updatedAddons = defaultAddons.map(addon => ({
          ...addon,
          selected: customerData.addons.includes(addon.id),
          complexity: customerData.addons.includes(addon.id) && addon.complexityPricing ? 'low' as const : undefined
        }));
        setAddons(updatedAddons);
      }
    } else {
      setSelectedCustomer(null);
      setModules(defaultModules);
      setAddons(defaultAddons);
      setMwManaged("");
      setSites("");
    }
  }, [customer, customers]);

  // Calculate frequency multiplier for billing
  const getFrequencyMultiplier = () => {
    switch (billingFrequency) {
      case "quarterly": return 0.25;
      case "biannual": return 0.5;
      case "annual": return 1;
      default: return 1;
    }
  };

  const handleCalculate = () => {
    if (!customer || newSystems === "" || mwManaged === "") {
      toast({
        title: "Missing information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedCustomer) return;
    
    const frequencyMultiplier = getFrequencyMultiplier();

    // Update calculation logic based on new pricing structure
    const totalMW = Number(mwManaged) + Number(newSystems);
    let calculationResult: CalculationResult = {
      moduleCosts: [],
      addonCosts: [],
      starterPackageCost: 0,
      minimumCharges: 0,
      totalMWCost: 0,
      totalPrice: 0
    };
    
    // Calculate costs based on package
    if (selectedCustomer.package === 'starter') {
      // Starter package - flat fee of $3000 per year
      calculationResult.starterPackageCost = 3000 * frequencyMultiplier;
      
      // Only Technical Monitoring included
      // No module-based charges for Starter package
    } else {
      // Pro or Custom package - calculate module costs
      const selectedModules = modules.filter(m => m.selected);
      
      calculationResult.moduleCosts = selectedModules.map(module => {
        let price = module.price;
        
        // Use custom pricing if available for this module
        if (selectedCustomer.package === 'custom' && 
            selectedCustomer.customPricing && 
            selectedCustomer.customPricing[module.id]) {
          price = selectedCustomer.customPricing[module.id];
        }
        
        return {
          moduleId: module.id,
          moduleName: module.name,
          cost: price * totalMW * frequencyMultiplier
        };
      });
      
      // Add up module costs
      const moduleTotalCost = calculationResult.moduleCosts.reduce((sum, item) => sum + item.cost, 0);
      calculationResult.totalMWCost = moduleTotalCost;
      
      // Ensure minimum $5000 for Pro package
      if (selectedCustomer.package === 'pro' && moduleTotalCost < 5000 * frequencyMultiplier) {
        calculationResult.totalMWCost = 5000 * frequencyMultiplier;
      }
    }
    
    // Calculate addon costs
    const selectedAddons = addons.filter(a => a.selected);
    
    calculationResult.addonCosts = selectedAddons.map(addon => {
      let addonPrice = 0;
      
      if (addon.complexityPricing && addon.complexity) {
        if (addon.complexity === 'low' && addon.lowPrice) {
          addonPrice = addon.lowPrice;
        } else if (addon.complexity === 'medium' && addon.mediumPrice) {
          addonPrice = addon.mediumPrice;
        } else if (addon.complexity === 'high' && addon.highPrice) {
          addonPrice = addon.highPrice;
        }
      } else if (addon.price) {
        addonPrice = addon.price;
      }
      
      // Apply frequency multiplier to addon costs
      return {
        addonId: addon.id,
        addonName: addon.name,
        cost: addonPrice * frequencyMultiplier
      };
    });
    
    // Calculate minimum charges if applicable
    let minimumCharges = 0;
    if (selectedCustomer.minimumCharge && sitesUnderThreshold) {
      minimumCharges = Number(selectedCustomer.minimumCharge) * Number(sitesUnderThreshold) * frequencyMultiplier;
    }
    
    calculationResult.minimumCharges = minimumCharges;
    
    // Calculate final total
    calculationResult.totalPrice = 
      calculationResult.starterPackageCost + 
      calculationResult.totalMWCost + 
      calculationResult.addonCosts.reduce((sum, item) => sum + item.cost, 0) +
      calculationResult.minimumCharges;
    
    setResult(calculationResult);
    setShowResult(true);
  };

  const handleSendToXero = async () => {
    if (!result || !selectedCustomer || !invoiceDate) return;
    
    setIsSending(true);
    
    try {
      // Format invoice data for Xero API
      const lineItems = [
        ...result.moduleCosts.map(mc => ({
          Description: mc.moduleName,
          Quantity: 1,
          UnitAmount: mc.cost,
          AccountCode: "200" // Revenue account
        })),
        ...result.addonCosts.map(ac => ({
          Description: ac.addonName,
          Quantity: 1,
          UnitAmount: ac.cost,
          AccountCode: "200"
        }))
      ];
      
      if (result.starterPackageCost > 0) {
        lineItems.unshift({
          Description: "AMMP OS Starter Package",
          Quantity: 1,
          UnitAmount: result.starterPackageCost,
          AccountCode: "200"
        });
      }
      
      if (result.minimumCharges > 0) {
        lineItems.push({
          Description: `Minimum Charges (${sitesUnderThreshold} sites)`,
          Quantity: 1,
          UnitAmount: result.minimumCharges,
          AccountCode: "200"
        });
      }
      
      const xeroInvoice = {
        Type: "ACCREC",
        Contact: { Name: selectedCustomer.name },
        Date: format(invoiceDate, "yyyy-MM-dd"),
        DueDate: format(new Date(invoiceDate.getTime() + 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"), // 30 days from invoice date
        LineItems: lineItems,
        Reference: `${billingFrequency.toUpperCase()}-${format(invoiceDate, "yyyyMMdd")}`,
        Status: "DRAFT"
      };
      
      const { data, error } = await supabase.functions.invoke('xero-send-invoice', {
        body: { invoice: xeroInvoice }
      });
      
      if (error) throw error;
      
      toast({
        title: "Invoice sent to Xero",
        description: "The invoice has been created in Xero as a draft.",
      });
      
      // Reset form
      setTimeout(() => {
        setCustomer("");
        setNewSystems("");
        setMwManaged("");
        setSites("");
        setSitesUnderThreshold("");
        setModules(defaultModules);
        setAddons(defaultAddons);
        setSelectedCustomer(null);
        setResult(null);
        setShowResult(false);
        setInvoiceDate(new Date());
        setBillingFrequency("annual");
      }, 2000);
    } catch (error) {
      console.error('Error sending invoice to Xero:', error);
      toast({
        title: "Failed to send invoice",
        description: error instanceof Error ? error.message : "Please check your Xero connection and try again.",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleModuleToggle = (moduleId: string) => {
    setModules(prevModules => 
      prevModules.map(m => 
        m.id === moduleId 
          ? { ...m, selected: !m.selected } 
          : m
      )
    );
    
    // If module is deselected, deselect all its addons as well
    if (modules.find(m => m.id === moduleId)?.selected) {
      setAddons(prevAddons => 
        prevAddons.map(a => 
          a.module === moduleId 
            ? { ...a, selected: false } 
            : a
        )
      );
    }
  };

  const handleAddonToggle = (addonId: string) => {
    setAddons(prevAddons => 
      prevAddons.map(a => 
        a.id === addonId 
          ? { ...a, selected: !a.selected } 
          : a
      )
    );
  };

  const handleComplexityChange = (addonId: string, complexity: 'low' | 'medium' | 'high') => {
    setAddons(prevAddons => 
      prevAddons.map(a => 
        a.id === addonId 
          ? { ...a, complexity } 
          : a
      )
    );
  };

  // Filter addons to only show those related to selected modules
  const getAddonsByModule = (moduleId: string) => {
    return addons.filter(a => a.module === moduleId);
  };

  const isProPackage = selectedCustomer?.package === 'pro' || selectedCustomer?.package === 'custom';

  const getInvoicePeriodText = () => {
    if (!invoiceDate) return "";
    
    const startDate = new Date(invoiceDate);
    const endDate = new Date(invoiceDate);
    
    if (billingFrequency === "quarterly") {
      endDate.setMonth(endDate.getMonth() + 3);
    } else if (billingFrequency === "biannual") {
      endDate.setMonth(endDate.getMonth() + 6);
    } else {
      endDate.setFullYear(endDate.getFullYear() + 1);
    }
    
    // Subtract one day from end date to make it inclusive
    endDate.setDate(endDate.getDate() - 1);
    
    return `${format(startDate, 'PPP')} - ${format(endDate, 'PPP')}`;
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
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="customer">Customer</Label>
            <Select value={customer} onValueChange={setCustomer}>
              <SelectTrigger id="customer">
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {selectedCustomer && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="invoice-date">Invoice Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {invoiceDate ? format(invoiceDate, "PPP") : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={invoiceDate}
                        onSelect={setInvoiceDate}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="billing-frequency">Billing Frequency</Label>
                  <Select value={billingFrequency} onValueChange={(value: "quarterly" | "biannual" | "annual") => setBillingFrequency(value)}>
                    <SelectTrigger id="billing-frequency">
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="biannual">Bi-annual</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="new-systems">New Systems</Label>
                  <Input
                    id="new-systems"
                    type="number"
                    placeholder="Enter number value"
                    min={0}
                    step={1}
                    value={newSystems}
                    onChange={(e) => setNewSystems(e.target.value ? Number(e.target.value) : "")}
                  />
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
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sites">Total Sites</Label>
                  <Input
                    id="sites"
                    type="number"
                    placeholder="Number of sites"
                    min={0}
                    value={sites}
                    onChange={(e) => setSites(e.target.value ? Number(e.target.value) : "")}
                  />
                </div>
                {selectedCustomer.minimumCharge && (
                  <div className="space-y-2">
                    <Label htmlFor="sites-threshold">Sites Under Threshold</Label>
                    <Input
                      id="sites-threshold"
                      type="number"
                      placeholder="Sites under threshold"
                      min={0}
                      max={sites || 0}
                      value={sitesUnderThreshold}
                      onChange={(e) => setSitesUnderThreshold(e.target.value ? Number(e.target.value) : "")}
                    />
                  </div>
                )}
              </div>
              
              <div className="space-y-2">
                <Label>Modules</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-1">
                  {modules.map((module) => (
                    <div 
                      key={module.id} 
                      className={`border rounded-md p-3 ${
                        selectedCustomer.package === 'starter' && module.id !== 'technicalMonitoring' 
                          ? 'opacity-60' : ''
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id={`module-${module.id}`}
                          checked={module.selected}
                          onCheckedChange={() => handleModuleToggle(module.id)}
                          disabled={selectedCustomer.package === 'starter' && module.id !== 'technicalMonitoring'}
                        />
                        <Label 
                          htmlFor={`module-${module.id}`}
                          className="flex-grow cursor-pointer text-sm font-medium"
                        >
                          {module.name}
                        </Label>
                         <span className="text-sm">
                          ${selectedCustomer.customPricing?.[module.id] || module.price}/MWp
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Only show addons for selected modules */}
              <div className="space-y-4">
                {modules
                  .filter(m => m.selected)
                  .map(module => {
                    const moduleAddons = getAddonsByModule(module.id);
                    if (moduleAddons.length === 0) return null;
                    
                    return (
                      <div key={`addon-group-${module.id}`} className="space-y-2">
                        <Label>{module.name} Add-ons</Label>
                        <div className="border rounded-md p-3 space-y-2">
                          {moduleAddons
                            .filter(addon => !addon.requiresPro || isProPackage)
                            .map(addon => (
                              <div key={addon.id} className="space-y-2">
                                <div className="flex items-center space-x-2">
                                  <Checkbox 
                                    id={`addon-${addon.id}`}
                                    checked={addon.selected}
                                    onCheckedChange={() => handleAddonToggle(addon.id)}
                                    disabled={addon.requiresPro && !isProPackage}
                                  />
                                  <Label 
                                    htmlFor={`addon-${addon.id}`}
                                    className="flex-grow cursor-pointer text-sm"
                                  >
                                    {addon.name}
                                  </Label>
                                  <span className="text-sm">
                                    {addon.complexityPricing 
                                      ? `$${addon.lowPrice}-${addon.highPrice}` 
                                      : `$${addon.price}`
                                    }
                                  </span>
                                </div>
                                
                                {/* Complexity selector for applicable addons */}
                                {addon.selected && addon.complexityPricing && (
                                  <div className="pl-6">
                                    <Select 
                                      value={addon.complexity || 'low'} 
                                      onValueChange={(value: any) => handleComplexityChange(addon.id, value)}
                                    >
                                      <SelectTrigger className="h-8">
                                        <SelectValue placeholder="Select complexity" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="low">Low (${addon.lowPrice})</SelectItem>
                                        <SelectItem value="medium">Medium (${addon.mediumPrice})</SelectItem>
                                        <SelectItem value="high">High (${addon.highPrice})</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}
                              </div>
                            ))
                          }
                        </div>
                      </div>
                    );
                  })
                }
              </div>
            </>
          )}
          
          <Button 
            className="w-full" 
            onClick={handleCalculate}
            disabled={!customer || newSystems === "" || mwManaged === "" || !invoiceDate}
          >
            <Calculator className="mr-2 h-4 w-4" />
            Calculate Invoice
          </Button>
        </div>
        
        {showResult && result && (
          <div className="mt-6 border rounded-lg p-4">
            <h3 className="font-medium text-lg mb-2">Invoice Calculation Result</h3>
            <p className="text-sm text-muted-foreground mb-4">
              <span className="font-medium">Billing period:</span> {getInvoicePeriodText()}
            </p>
            
            {selectedCustomer?.package === 'starter' && (
              <div className="space-y-1 text-sm mb-3">
                <div className="flex justify-between">
                  <span>AMMP OS Starter Package:</span>
                  <span>{formatCurrency(result.starterPackageCost)}</span>
                </div>
              </div>
            )}
            
            {selectedCustomer?.package !== 'starter' && result.moduleCosts.length > 0 && (
              <div className="space-y-3 mb-4">
                <h4 className="font-medium text-sm">Module Costs:</h4>
                <div className="space-y-1 text-sm pl-2">
                  {result.moduleCosts.map((item) => (
                    <div key={item.moduleId} className="flex justify-between">
                      <span>{item.moduleName}:</span>
                      <span>{formatCurrency(item.cost)}</span>
                    </div>
                  ))}
                </div>
                
                {selectedCustomer?.package === 'pro' && result.moduleCosts.reduce((sum, m) => sum + m.cost, 0) < 5000 * getFrequencyMultiplier() && (
                  <div className="text-sm pl-2 flex justify-between font-medium">
                    <span>Minimum Package Cost Applied:</span>
                    <span>{formatCurrency(5000 * getFrequencyMultiplier())}</span>
                  </div>
                )}
              </div>
            )}
            
            {result.addonCosts.length > 0 && (
              <div className="space-y-3 mb-4">
                <h4 className="font-medium text-sm">Add-on Costs:</h4>
                <div className="space-y-1 text-sm pl-2">
                  {result.addonCosts.map((item) => (
                    <div key={item.addonId} className="flex justify-between">
                      <span>{item.addonName}:</span>
                      <span>{formatCurrency(item.cost)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {result.minimumCharges > 0 && (
              <div className="space-y-1 text-sm mb-3">
                <div className="flex justify-between">
                  <span>Minimum Charges ({sitesUnderThreshold} sites):</span>
                  <span>{formatCurrency(result.minimumCharges)}</span>
                </div>
              </div>
            )}
            
            <Separator className="my-3" />
            
            <div className="flex justify-between font-medium">
              <span>Total Invoice Amount:</span>
              <span>{formatCurrency(result.totalPrice)}</span>
            </div>
            
            <Button 
              className="w-full mt-4" 
              onClick={handleSendToXero}
              disabled={isSending}
            >
              {isSending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send to Xero
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default InvoiceCalculator;


import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Calculator, Send, ArrowRight, CalendarIcon, Loader2, ArrowUp, ArrowDown } from "lucide-react";
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
import { format, formatDistanceToNow } from "date-fns";
import { useCurrency } from "@/contexts/CurrencyContext";
import { supabase } from "@/integrations/supabase/client";
import { ContractPackageSelector } from "@/components/contracts/ContractPackageSelector";
import { cn } from "@/lib/utils";
import { 
  MODULES, 
  ADDONS, 
  type ComplexityLevel, 
  type PackageType,
  type PricingTier,
  calculateTieredPrice
} from "@/data/pricingData";
import { TierPricingEditor } from "@/components/contracts/TierPricingEditor";
import { 
  calculateInvoice, 
  getFrequencyMultiplier,
  getPeriodMonthsMultiplier,
  calculateProrationMultiplier,
  type CalculationParams,
  type CalculationResult 
} from "@/lib/invoiceCalculations";
import { monitorMWAndNotify } from "@/utils/mwMonitoring";

// Simplified interfaces - complex types moved to shared files
interface Module {
  id: string;
  name: string;
  price: number;
  selected: boolean;
}

interface Addon {
  id: string;
  name: string;
  price?: number;
  complexityPricing?: boolean;
  tieredPricing?: boolean;
  pricingTiers?: PricingTier[];
  autoActivateFromAMMP?: boolean;
  ammpSourceField?: string;
  lowPrice?: number;
  mediumPrice?: number;
  highPrice?: number;
  complexity?: ComplexityLevel;
  selected: boolean;
  requiresPro?: boolean;
  solcastSiteCount?: number;
  quantity?: number;
  customPrice?: number;
  customTiers?: PricingTier[];
  calculatedTieredPrice?: {
    pricePerUnit: number;
    totalPrice: number;
    appliedTier: PricingTier | null;
  };
}

interface ContractAddon {
  id: string;
  quantity?: number;
  complexity?: string;
  customPrice?: number;
  customTiers?: PricingTier[];
}

interface Customer {
  id: string;
  name: string;
  mwManaged: number;
  lastInvoiced?: string;
  signedDate?: string;
  periodStart?: string;
  periodEnd?: string;
  billingFrequency: string;
  nextInvoiceDate?: string;
  package: PackageType;
  modules: string[];
  addons: any[];
  minimumCharge?: number;
  minimumChargeTiers?: any[];
  portfolioDiscountTiers?: any[];
  customPricing?: any;
  minimumAnnualValue?: number;
  volumeDiscounts?: any;
  currency: 'USD' | 'EUR';
  sites?: number;
  ammpCapabilities?: any;
}

// Default modules and addons from shared data
const defaultModules: Module[] = MODULES.map(m => ({ ...m, selected: false }));
const defaultAddons: Addon[] = ADDONS.map(a => ({ ...a, selected: false }));

interface InvoiceCalculatorProps {
  preselectedCustomerId?: string;
  prefilledDate?: Date;
  onInvoiceCreated?: () => void;
}

export function InvoiceCalculator({ 
  preselectedCustomerId, 
  prefilledDate,
  onInvoiceCreated 
}: InvoiceCalculatorProps = {}) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customer, setCustomer] = useState("");
  const [mwManaged, setMwManaged] = useState<number | "">("");
  const [sites, setSites] = useState<number | "">("");
  const [solcastSites, setSolcastSites] = useState<number | "">("");
  const [modules, setModules] = useState<Module[]>(defaultModules);
  const [addons, setAddons] = useState<Addon[]>(defaultAddons);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [billingFrequency, setBillingFrequency] = useState<"monthly" | "quarterly" | "biannual" | "annual">("annual");
  const [invoiceDate, setInvoiceDate] = useState<Date | undefined>(prefilledDate || new Date());
  const [isSending, setIsSending] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [lastInvoiceMW, setLastInvoiceMW] = useState<number | null>(null);
  const [mwChange, setMwChange] = useState<number>(0);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
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
          ammp_capabilities,
          contracts (
            id,
            package,
            modules,
            addons,
            custom_pricing,
            minimum_charge,
            minimum_charge_tiers,
            portfolio_discount_tiers,
            minimum_annual_value,
            volume_discounts,
            currency,
            billing_frequency
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
          // Keep full addon objects with custom tiers instead of just IDs
          const addons = Array.isArray(contract.addons) ? contract.addons : [];
          const customPricing = typeof contract.custom_pricing === 'object' && contract.custom_pricing !== null ? contract.custom_pricing as {[key: string]: number} : {};
          const volumeDiscounts = typeof contract.volume_discounts === 'object' && contract.volume_discounts !== null ? contract.volume_discounts as any : {};
          const minimumChargeTiers = Array.isArray(contract.minimum_charge_tiers) ? contract.minimum_charge_tiers : [];
          const portfolioDiscountTiers = Array.isArray(contract.portfolio_discount_tiers) ? contract.portfolio_discount_tiers : [];
          
          return {
            id: c.id,
            name: c.name,
            package: contract.package as 'starter' | 'pro' | 'custom' | 'hybrid_tiered',
            mwManaged: Number(c.mwp_managed) || 0,
            modules,
            addons,
            minimumCharge: Number(contract.minimum_charge) || 0,
            minimumChargeTiers,
            portfolioDiscountTiers,
            minimumAnnualValue: Number(contract.minimum_annual_value) || 0,
            customPricing,
            volumeDiscounts,
            currency: (contract.currency as 'USD' | 'EUR') || 'EUR',
            billingFrequency: (contract.billing_frequency as 'monthly' | 'quarterly' | 'biannual' | 'annual') || 'annual',
            ammpCapabilities: c.ammp_capabilities || null,
          };
        });

      setCustomers(transformedCustomers);
      
      // Pre-select customer if provided
      if (preselectedCustomerId) {
        setCustomer(preselectedCustomerId);
      }
    };

    loadCustomers();
  }, [preselectedCustomerId]);

  // Fetch last invoice when customer is selected to calculate MW change
  useEffect(() => {
    const fetchLastInvoice = async () => {
      if (!selectedCustomer) {
        setLastInvoiceMW(null);
        setMwChange(0);
        return;
      }

      setIsLoadingHistory(true);
      try {
        const { data: lastInvoice, error } = await supabase
          .from('invoices')
          .select('total_mw, invoice_date')
          .eq('customer_id', selectedCustomer.id)
          .order('invoice_date', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (lastInvoice) {
          setLastInvoiceMW(lastInvoice.total_mw);
          // Calculate change when mwManaged is set
          const currentMW = Number(mwManaged) || selectedCustomer.mwManaged;
          setMwChange(currentMW - lastInvoice.total_mw);
        } else {
          // First invoice for this customer
          setLastInvoiceMW(null);
          setMwChange(0);
        }
      } catch (error) {
        console.error('Error fetching last invoice:', error);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    fetchLastInvoice();
  }, [selectedCustomer, mwManaged]);

  // Update modules and addons when a customer is selected
  useEffect(() => {
    if (customer) {
      const customerData = customers.find((c) => c.id === customer) || null;
      setSelectedCustomer(customerData);
      
      if (customerData) {
        // Reset site values if customer has no minimum charge
        if (!customerData.minimumCharge) {
          setSites("");
        }
        // Set initial MW managed
        setMwManaged(customerData.mwManaged);
        if (customerData.sites !== undefined) {
          setSites(customerData.sites);
        }
        
        // Pre-fill billing frequency from contract
        setBillingFrequency(customerData.billingFrequency as 'monthly' | 'quarterly' | 'biannual' | 'annual');
        
        // Auto-activate addons based on AMMP capabilities
        const updatedAddons = defaultAddons.map(addon => {
          // Find matching contract addon (could be string ID or full object)
          const contractAddon = customerData.addons.find((a: any) => 
            typeof a === 'string' ? a === addon.id : a.id === addon.id
          );
          
          const contractAddonObj = typeof contractAddon === 'object' ? contractAddon : null;
          
          // Check if addon should auto-activate
          if (addon.autoActivateFromAMMP && addon.ammpSourceField) {
            const sourceValue = customerData.ammpCapabilities?.[addon.ammpSourceField];
            
            if (sourceValue && sourceValue > 0) {
              // Use custom tiers from contract if available, otherwise use default
              const tiersToUse = contractAddonObj?.customTiers || addon.pricingTiers;
              
              // Create addon definition with custom tiers for calculation
              const addonWithCustomTiers = tiersToUse && contractAddonObj?.customTiers ? {
                ...addon,
                pricingTiers: contractAddonObj.customTiers
              } : addon;
              
              // Auto-activate with quantity and tiered pricing
              const tieredCalc = addon.tieredPricing 
                ? calculateTieredPrice(addonWithCustomTiers, sourceValue, contractAddonObj?.customTiers)
                : undefined;
              
              // Update solcast sites state for display
              if (addon.id === 'satelliteDataAPI') {
                setSolcastSites(sourceValue);
              }
              
              return {
                ...addon,
                selected: true,
                quantity: sourceValue,
                customTiers: contractAddonObj?.customTiers, // Store custom tiers in state
                calculatedTieredPrice: tieredCalc
              };
            }
          }
          
          // Otherwise, check if it was manually selected in contract
          const isSelected = typeof contractAddon === 'string' 
            ? true 
            : contractAddon !== undefined;
          
          return {
            ...addon,
            selected: isSelected,
            quantity: contractAddonObj?.quantity,
            customTiers: contractAddonObj?.customTiers,
            complexity: isSelected && addon.complexityPricing 
              ? (contractAddonObj?.complexity as ComplexityLevel) || 'low' as const 
              : undefined,
            customPrice: contractAddonObj?.customPrice
          };
        });
        
        setAddons(updatedAddons);
        
        // Apply custom pricing to modules if available
        const updatedModules = defaultModules.map(module => {
          let customPrice = customerData.customPricing?.[module.id];
          
          // For hybrid_tiered pricing, exclude technical monitoring from selection
          const shouldSelect = customerData.package === 'hybrid_tiered' && module.id === 'technicalMonitoring'
            ? false
            : customerData.modules.includes(module.id);
          
          return {
            ...module,
            price: customPrice !== undefined ? customPrice : module.price,
            selected: shouldSelect
          };
        });
        setModules(updatedModules);
        
        // Update addons based on customer selection (if not already set by Solcast)
        if (!customerData.ammpCapabilities?.sitesWithSolcast) {
          const updatedAddons = defaultAddons.map(addon => ({
            ...addon,
            selected: customerData.addons.includes(addon.id),
            complexity: customerData.addons.includes(addon.id) && addon.complexityPricing ? 'low' as const : undefined
          }));
          setAddons(updatedAddons);
        }
      }
    } else {
      setSelectedCustomer(null);
      setModules(defaultModules);
      setAddons(defaultAddons);
      setMwManaged("");
      setSites("");
    }
  }, [customer, customers]);

  // Auto-calculate when key fields change
  useEffect(() => {
    // Only auto-calculate if we have the minimum required data
    if (customer && mwManaged !== "" && invoiceDate && selectedCustomer) {
      // Debounce to avoid excessive calculations
      const timer = setTimeout(() => {
        handleCalculate();
      }, 300);
      
      return () => clearTimeout(timer);
    }
  }, [
    billingFrequency,  // Main trigger - billing frequency changes
    mwManaged,         // MW value changes
    modules,           // Module selection changes
    addons,            // Addon selection/quantity changes
    invoiceDate
  ]);

  // Calculation helper - now using shared logic
  const getInvoicePeriodText = () => {
    if (!invoiceDate) return "";
    
    const startDate = new Date(invoiceDate);
    const endDate = new Date(invoiceDate);
    
    if (billingFrequency === "quarterly") {
      // Quarterly is retrospective: period ends on invoice date, starts 3 months prior
      startDate.setMonth(startDate.getMonth() - 3);
    } else if (billingFrequency === "monthly") {
      // Forward-looking for other frequencies
      endDate.setMonth(endDate.getMonth() + 1);
      endDate.setDate(endDate.getDate() - 1);
    } else if (billingFrequency === "biannual") {
      endDate.setMonth(endDate.getMonth() + 6);
      endDate.setDate(endDate.getDate() - 1);
    } else {
      // Annual
      endDate.setFullYear(endDate.getFullYear() + 1);
      endDate.setDate(endDate.getDate() - 1);
    }
    
    return `${format(startDate, 'PPP')} - ${format(endDate, 'PPP')}`;
  };

  const handleCalculate = async () => {
    if (calculating) return; // Prevent multiple rapid clicks
    
    setCalculating(true);
    
    try {
      if (!customer || mwManaged === "") {
        toast({
          title: "Missing information",
          description: "Please fill in all required fields.",
          variant: "destructive",
        });
        return;
      }

      if (!selectedCustomer) return;

    // Check if this is the first invoice
    const isFirstInvoice = selectedCustomer.signedDate && 
                           !selectedCustomer.lastInvoiced &&
                           selectedCustomer.periodStart &&
                           invoiceDate;
    
    let frequencyMultiplier = getFrequencyMultiplier(billingFrequency);
    let invoicePeriodDisplay = getInvoicePeriodText();
    
    // For first invoice, calculate based on initial period (signed to first invoice)
    if (isFirstInvoice) {
      const signedDate = new Date(selectedCustomer.signedDate);
      const firstInvoiceDate = new Date(invoiceDate);
      frequencyMultiplier = calculateProrationMultiplier(
        signedDate, 
        firstInvoiceDate, 
        billingFrequency
      );
      invoicePeriodDisplay = `${new Date(selectedCustomer.signedDate).toLocaleDateString()} - ${firstInvoiceDate.toLocaleDateString()}`;
    }

    // Update calculation logic based on new pricing structure
    const totalMW = Number(mwManaged);
    
    // Store invoice period separately since it's not in the standard CalculationResult
    const invoicePeriod = invoicePeriodDisplay;
    
    let calculationResult: CalculationResult = {
      moduleCosts: [],
      addonCosts: [],
      starterPackageCost: 0,
      minimumCharges: 0,
      totalMWCost: 0,
      totalPrice: 0,
    };
    
    // Calculate costs based on package
    if (selectedCustomer.package === 'starter') {
      // Starter package - use contract's minimum annual value (default: €3000)
      const minimumValue = selectedCustomer.minimumAnnualValue || 3000;
      calculationResult.starterPackageCost = minimumValue * frequencyMultiplier;
      
      // Only Technical Monitoring included
      // No module-based charges for Starter package
    } else if (selectedCustomer.package === 'hybrid_tiered') {
      // Hybrid Tiered package - uses fixed per-MWp rates for ongrid vs hybrid
      const capabilities = selectedCustomer.ammpCapabilities;
      const ongridPrice = selectedCustomer.customPricing?.ongrid_per_mwp || 0;
      const hybridPrice = selectedCustomer.customPricing?.hybrid_per_mwp || 0;
      
      if (capabilities && capabilities.ongridTotalMW !== undefined && capabilities.hybridTotalMW !== undefined) {
        const ongridMW = capabilities.ongridTotalMW;
        const hybridMW = capabilities.hybridTotalMW;
        
        const ongridCost = ongridMW * ongridPrice * frequencyMultiplier;
        const hybridCost = hybridMW * hybridPrice * frequencyMultiplier;
        
        calculationResult.hybridTieredBreakdown = {
          ongrid: { mw: ongridMW, cost: ongridCost, rate: ongridPrice },
          hybrid: { mw: hybridMW, cost: hybridCost, rate: hybridPrice }
        };
        
        // Calculate module costs (exclude Technical Monitoring - already covered by hybrid pricing)
        const selectedModules = modules.filter(m => 
          m.selected && m.id !== 'technicalMonitoring'
        );
        
        calculationResult.moduleCosts = selectedModules.map(module => ({
          moduleId: module.id,
          moduleName: module.name,
          cost: module.price * totalMW * frequencyMultiplier,
          rate: module.price,
          mw: totalMW
        }));
        
        const moduleTotalCost = calculationResult.moduleCosts.reduce(
          (sum, item) => sum + item.cost, 
          0
        );
        
        // Total = hybrid breakdown + modules
        calculationResult.totalMWCost = ongridCost + hybridCost + moduleTotalCost;
      } else {
        // Fallback if no AMMP data
        calculationResult.totalMWCost = totalMW * ongridPrice * frequencyMultiplier;
      }
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
          cost: price * totalMW * frequencyMultiplier,
          rate: price,
          mw: totalMW
        };
      });
      
      // Add up module costs
      const moduleTotalCost = calculationResult.moduleCosts.reduce((sum, item) => sum + item.cost, 0);
      calculationResult.totalMWCost = moduleTotalCost;
      
      // Ensure minimum annual contract value for Pro package
      const proMinimum = selectedCustomer.minimumAnnualValue || 5000;
      if (selectedCustomer.package === 'pro' && moduleTotalCost < proMinimum * frequencyMultiplier) {
        calculationResult.totalMWCost = proMinimum * frequencyMultiplier;
      }
    }
    
    // Prepare asset breakdown for site-level pricing
    const assetBreakdown = selectedCustomer.ammpCapabilities?.assetBreakdown?.map((asset: any) => ({
      assetId: asset.assetId,
      assetName: asset.assetName,
      totalMW: asset.totalMW,
      isHybrid: asset.isHybrid
    }));
    
    // Enable site minimum pricing if we have asset breakdown and minimum charge tiers
    const enableSiteMinPricing = !!(
      assetBreakdown && 
      assetBreakdown.length > 0
    );
    
    // Use shared calculation logic with all parameters
    const params: CalculationParams = {
      packageType: selectedCustomer.package,
      totalMW,
      selectedModules: modules.filter(m => m.selected).map(m => m.id),
      selectedAddons: addons.filter(a => a.selected).map(a => ({
        id: a.id,
        complexity: a.complexity,
        customPrice: a.customPrice,
        quantity: a.quantity,
        customTiers: a.customTiers
      })),
      customPricing: selectedCustomer.customPricing,
      minimumAnnualValue: selectedCustomer.minimumAnnualValue,
      minimumCharge: selectedCustomer.minimumCharge,
      minimumChargeTiers: selectedCustomer.minimumChargeTiers,
      portfolioDiscountTiers: selectedCustomer.portfolioDiscountTiers,
      frequencyMultiplier,
      billingFrequency,
      ammpCapabilities: selectedCustomer.ammpCapabilities,
      assetBreakdown,
      enableSiteMinimumPricing: enableSiteMinPricing
    };
    
    calculationResult = calculateInvoice(params);
    
    // Calculate addon costs (legacy code - now handled in shared function)
    const selectedAddons = addons.filter(a => a.selected);
    
    calculationResult.addonCosts = selectedAddons.map(addon => {
      let addonPrice = 0;
      
      // Handle tiered pricing first
      if (addon.tieredPricing && addon.quantity) {
        const tierCalc = calculateTieredPrice(addon, addon.quantity, addon.customTiers);
        
        // Satellite Data API uses monthly pricing, multiply by period months
        // Other addons are one-off costs, no multiplication needed
        const priceMultiplier = addon.id === 'satelliteDataAPI' 
          ? getPeriodMonthsMultiplier(billingFrequency)
          : 1;
        
        return {
          addonId: addon.id,
          addonName: addon.name,
          cost: tierCalc.totalPrice * priceMultiplier,
          quantity: addon.quantity,
          tierApplied: tierCalc.appliedTier,
          pricePerUnit: tierCalc.pricePerUnit
        };
      }
      
      // Check for custom price override
      if (addon.customPrice != null) {
        addonPrice = addon.customPrice;
      } else if (addon.complexityPricing && addon.complexity) {
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
      
      const quantity = addon.quantity || 1;
      
      // One-off costs, no frequency multiplication
      return {
        addonId: addon.id,
        addonName: addon.name,
        cost: addonPrice * quantity,
        quantity
      };
    });
    
      // Store result with invoice period
      setResult({ ...calculationResult, invoicePeriod } as any);
      setShowResult(true);
    } catch (error) {
      toast({
        title: "Calculation Error",
        description: "There was an error calculating the invoice.",
        variant: "destructive",
      });
    } finally {
      setCalculating(false);
    }
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
        const siteCount = result.siteMinimumPricingBreakdown?.totalSitesOnMinimum || 0;
        lineItems.push({
          Description: siteCount > 0 
            ? `Minimum Charges (${siteCount} sites)` 
            : "Minimum Charges",
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
        Currency: selectedCustomer.currency,
        Status: "DRAFT"
      };
      
      const { data, error } = await supabase.functions.invoke('xero-send-invoice', {
        body: { invoice: xeroInvoice }
      });
      
      if (error) throw error;
      
      // Extract Xero invoice ID from response
      const xeroInvoiceId = data?.Invoices?.[0]?.InvoiceID;
      
      toast({
        title: "Invoice sent to Xero",
        description: "The invoice has been created in Xero as a draft.",
      });
      
      // Update period dates for next invoice
      if (selectedCustomer) {
        const currentPeriodEnd = invoiceDate ? new Date(invoiceDate) : new Date();
        const nextPeriodStart = new Date(currentPeriodEnd);
        nextPeriodStart.setDate(nextPeriodStart.getDate() + 1);
        
        let nextPeriodEnd = new Date(nextPeriodStart);
        switch (billingFrequency) {
          case 'monthly':
            nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 1);
            break;
          case 'quarterly':
            nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 3);
            break;
          case 'biannual':
            nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 6);
            break;
          case 'annual':
            nextPeriodEnd.setFullYear(nextPeriodEnd.getFullYear() + 1);
            break;
        }
        
        await supabase
          .from('contracts')
          .update({
            period_start: nextPeriodStart.toISOString(),
            period_end: nextPeriodEnd.toISOString(),
            next_invoice_date: nextPeriodEnd.toISOString()
          })
          .eq('customer_id', selectedCustomer.id)
          .eq('contract_status', 'active');
      }
      
      // Save invoice record to database for history tracking
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Get contract ID for this customer
        const { data: contractData } = await supabase
          .from('contracts')
          .select('id')
          .eq('customer_id', selectedCustomer.id)
          .eq('contract_status', 'active')
          .maybeSingle();
        
        const { error: invoiceError } = await supabase
          .from('invoices')
          .insert([{
            user_id: user.id,
            customer_id: selectedCustomer.id,
            contract_id: contractData?.id || null,
            invoice_date: invoiceDate.toISOString(),
            xero_invoice_id: xeroInvoiceId || null,
            billing_frequency: billingFrequency,
            mw_managed: Number(mwManaged),
            mw_change: mwChange,
            total_mw: Number(mwManaged),
            invoice_amount: result.totalPrice,
            currency: selectedCustomer.currency,
            modules_data: modules.filter(m => m.selected) as any,
            addons_data: addons.filter(a => a.selected) as any
          }]);

        if (invoiceError) {
          console.error('Failed to save invoice record:', invoiceError);
          // Don't fail the whole operation, just log
        } else {
          // Check MW capacity for capped contracts
          if (contractData?.id) {
            await monitorMWAndNotify(
              user.id,
              contractData.id,
              selectedCustomer.name,
              Number(mwManaged)
            );
          }
        }
      }
      
      // Notify parent if callback provided
      onInvoiceCreated?.();
      
      // Reset form
      setTimeout(() => {
        setCustomer("");
        setMwManaged("");
        setSites("");
        setModules(defaultModules);
        setAddons(defaultAddons);
        setSelectedCustomer(null);
        setResult(null);
        setShowResult(false);
        setInvoiceDate(new Date());
        setBillingFrequency("annual");
        setLastInvoiceMW(null);
        setMwChange(0);
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
    // Modules and addons are now independent - no coupling!
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

  const handleSolcastSitesChange = (addonId: string, siteCount: number) => {
    setAddons(prevAddons => 
      prevAddons.map(a => 
        a.id === addonId 
          ? { ...a, solcastSiteCount: siteCount } 
          : a
      )
    );
  };

  // Deprecated: Addons are now independent of modules
  // const getAddonsByModule = (moduleId: string) => {
  //   return addons.filter(a => a.module === moduleId);
  // };

  const isProPackage = selectedCustomer?.package === 'pro' || selectedCustomer?.package === 'custom';


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
              <div className="flex items-center gap-2 mb-4 text-sm">
                <Label>Contract Currency:</Label>
                <span className="font-medium">{selectedCustomer.currency === 'USD' ? '$ USD' : '€ EUR'}</span>
              </div>

              {selectedCustomer.ammpCapabilities && (
                <div className="p-3 border rounded-lg bg-muted/50 mb-4">
                  <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                    📊 AMMP Asset Breakdown
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Total Sites:</span>
                      <span className="ml-2 font-medium">{selectedCustomer.ammpCapabilities.totalSites}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Total MW:</span>
                      <span className="ml-2 font-medium">{selectedCustomer.ammpCapabilities.totalMW?.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">On-Grid Sites:</span>
                      <span className="ml-2 font-medium">
                        {selectedCustomer.ammpCapabilities.ongridSites} 
                        ({selectedCustomer.ammpCapabilities.ongridTotalMW?.toFixed(2)} MWp)
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Hybrid Sites:</span>
                      <span className="ml-2 font-medium">
                        {selectedCustomer.ammpCapabilities.hybridSites}
                        ({selectedCustomer.ammpCapabilities.hybridTotalMW?.toFixed(2)} MWp)
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Solcast-enabled:</span>
                      <span className="ml-2 font-medium">{selectedCustomer.ammpCapabilities.sitesWithSolcast} sites</span>
                    </div>
                  </div>
                </div>
              )}
              
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
                  <Select value={billingFrequency} onValueChange={(value: "monthly" | "quarterly" | "biannual" | "annual") => setBillingFrequency(value)}>
                    <SelectTrigger id="billing-frequency">
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="biannual">Bi-annual</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="mw-managed">Total MW for Invoice (from AMMP sync)</Label>
                  {lastInvoiceMW !== null && (
                    <div className={cn(
                      "text-xs font-medium px-2 py-1 rounded-full flex items-center gap-1",
                      mwChange > 0 && "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400",
                      mwChange < 0 && "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400",
                      mwChange === 0 && "bg-muted text-muted-foreground"
                    )}>
                      {mwChange > 0 && <ArrowUp className="h-3 w-3" />}
                      {mwChange < 0 && <ArrowDown className="h-3 w-3" />}
                      {mwChange === 0 ? "No change" : `${mwChange > 0 ? '+' : ''}${mwChange.toFixed(2)} MW`}
                      <span className="text-muted-foreground ml-1">vs last</span>
                    </div>
                  )}
                  {lastInvoiceMW === null && mwManaged && (
                    <div className="text-xs text-muted-foreground">First invoice</div>
                  )}
                </div>
                <Input
                  id="mw-managed"
                  type="number"
                  placeholder="Enter MW value"
                  min={0}
                  step={0.1}
                  value={mwManaged}
                  onChange={(e) => setMwManaged(e.target.value ? Number(e.target.value) : "")}
                />
                {lastInvoiceMW !== null && (
                  <p className="text-xs text-muted-foreground">
                    Previous invoice: {lastInvoiceMW.toFixed(2)} MW
                  </p>
                )}
              </div>
              
              {(selectedCustomer?.volumeDiscounts?.siteSizeDiscount != null && 
                selectedCustomer?.volumeDiscounts?.siteSizeDiscount > 0) && (
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
                </div>
              )}
              
              <div className="space-y-2">
                <Label>Modules</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-1">
                  {modules.map((module) => (
                    <div 
                      key={module.id} 
                      className={`border rounded-md p-3 ${
                        (selectedCustomer.package === 'starter' && module.id !== 'technicalMonitoring') ||
                        (selectedCustomer.package === 'hybrid_tiered' && module.id === 'technicalMonitoring')
                          ? 'opacity-60' : ''
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id={`module-${module.id}`}
                          checked={module.selected}
                          onCheckedChange={() => handleModuleToggle(module.id)}
                          disabled={
                            (selectedCustomer.package === 'starter' && module.id !== 'technicalMonitoring') ||
                            (selectedCustomer.package === 'hybrid_tiered' && module.id === 'technicalMonitoring')
                          }
                        />
                        <Label 
                          htmlFor={`module-${module.id}`}
                          className="flex-grow cursor-pointer text-sm font-medium"
                        >
                          {module.name}
                        </Label>
                         <span className="text-sm">
                          €{selectedCustomer.customPricing?.[module.id] || module.price}/MWp
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Add-ons Section - Independent of Modules */}
              <div className="space-y-2">
                <Label>Add-ons (independent of modules)</Label>
                <div className="border rounded-md p-3 space-y-2">
                  {addons
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
                            {addon.tieredPricing && addon.pricingTiers ? (
                              <span className="text-xs">
                                €{addon.pricingTiers[0].pricePerUnit}-€{addon.pricingTiers[addon.pricingTiers.length - 1].pricePerUnit}/site
                              </span>
                            ) : addon.complexityPricing ? (
                              `€${addon.lowPrice}-€${addon.highPrice}`
                            ) : (
                              `€${addon.price}`
                            )}
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
                                <SelectItem value="low">Low (€{addon.lowPrice})</SelectItem>
                                <SelectItem value="medium">Medium (€{addon.mediumPrice})</SelectItem>
                                <SelectItem value="high">High (€{addon.highPrice})</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        
                        {/* Price and Quantity inputs for all selected addons */}
                        {addon.selected && (
                          <div className="pl-6 space-y-2">
                        {/* Tiered pricing display and editor - ONLY FOR SATELLITE DATA API */}
                        {addon.selected && addon.id === 'satelliteDataAPI' && addon.tieredPricing && addon.pricingTiers && (
                          <div className="pl-6 space-y-2 mt-2">
                            {/* Current tier summary */}
                            {addon.calculatedTieredPrice && (
                              <div className="text-xs bg-muted/50 p-2 rounded space-y-1 border">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Quantity: {addon.quantity || 0} sites</span>
                                </div>
                                <div className="flex justify-between font-medium">
                                  <span>Tier: {addon.calculatedTieredPrice.appliedTier?.label}</span>
                                  <span>€{addon.calculatedTieredPrice.pricePerUnit.toFixed(2)}/site/month</span>
                                </div>
                                <div className="flex justify-between text-xs text-muted-foreground">
                                  <span>Invoice period:</span>
                                  <span>
                                    {billingFrequency === 'monthly' ? '1 month' :
                                     billingFrequency === 'quarterly' ? '3 months' : 
                                     billingFrequency === 'biannual' ? '6 months' :
                                     '12 months'}
                                  </span>
                                </div>
                                <div className="flex justify-between text-primary font-semibold">
                                  <span>Total:</span>
                                  <span>€{addon.calculatedTieredPrice.totalPrice.toFixed(2)}</span>
                                </div>
                              </div>
                            )}
                            
                            {/* Tier editor */}
                            <TierPricingEditor
                              tiers={addon.customTiers || addon.pricingTiers}
                              onTiersChange={(newTiers) => {
                                setAddons(prev => prev.map(a => {
                                  if (a.id === addon.id) {
                                    const updatedAddon = { ...a, customTiers: newTiers };
                                    // Recalculate with new tiers
                                    if (a.tieredPricing && a.quantity) {
                                      updatedAddon.calculatedTieredPrice = calculateTieredPrice(
                                        a,
                                        a.quantity,
                                        newTiers
                                      );
                                    }
                                    return updatedAddon;
                                  }
                                  return a;
                                }));
                              }}
                              currentQuantity={addon.quantity}
                              currencySymbol="€"
                            />
                          </div>
                        )}
                        
                        {/* Tiered pricing display for non-satellite addons */}
                        {addon.selected && addon.id !== 'satelliteDataAPI' && addon.tieredPricing && addon.calculatedTieredPrice && (
                          <div className="pl-6">
                            <div className="text-xs bg-muted/50 p-2 rounded space-y-1 border">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Quantity: {addon.quantity || 0} sites</span>
                              </div>
                              <div className="flex justify-between font-medium">
                                <span>Tier: {addon.calculatedTieredPrice.appliedTier?.label}</span>
                                <span>€{addon.calculatedTieredPrice.pricePerUnit}/site</span>
                              </div>
                              <div className="flex justify-between text-primary font-semibold">
                                <span>Total:</span>
                                <span>€{addon.calculatedTieredPrice.totalPrice.toFixed(2)}</span>
                              </div>
                            </div>
                          </div>
                        )}
                            
                            <div className="flex items-center gap-4">
                              {/* Hide price input for tiered pricing addons */}
                              {!addon.tieredPricing && (
                                <div className="flex items-center gap-2">
                                  <Label htmlFor={`price-${addon.id}`} className="text-sm whitespace-nowrap">
                                    Price:
                                  </Label>
                                  <Input
                                    id={`price-${addon.id}`}
                                    type="number"
                                    placeholder={addon.complexityPricing 
                                      ? `${addon.lowPrice}-${addon.highPrice}` 
                                      : String(addon.price)}
                                    min={0}
                                    step={0.01}
                                    className="w-28 h-8"
                                    value={addon.customPrice ?? ''}
                                    onChange={(e) => {
                                      const value = e.target.value ? Number(e.target.value) : undefined;
                                      setAddons(prev => prev.map(a => 
                                        a.id === addon.id ? { ...a, customPrice: value } : a
                                      ));
                                    }}
                                  />
                                </div>
                              )}
                              <div className="flex items-center gap-2">
                                <Label htmlFor={`quantity-${addon.id}`} className="text-sm whitespace-nowrap">
                                  Quantity:
                                </Label>
                                <Input
                                  id={`quantity-${addon.id}`}
                                  type="number"
                                  placeholder="1"
                                  min={1}
                                  step={1}
                                  className="w-20 h-8"
                                  value={addon.quantity || 1}
                                  onChange={(e) => {
                                    const value = Math.max(1, Number(e.target.value) || 1);
                                    setAddons(prev => prev.map(a => {
                                      if (a.id === addon.id) {
                                        const updatedAddon = { ...a, quantity: value };
                                        // Recalculate tiered price if applicable
                                        if (a.tieredPricing && a.pricingTiers) {
                                          updatedAddon.calculatedTieredPrice = calculateTieredPrice(
                                            a,
                                            value,
                                            a.customTiers
                                          );
                                        }
                                        return updatedAddon;
                                      }
                                      return a;
                                    }));
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  }
                </div>
              </div>
            </>
          )}
          
            <Button 
              className="w-full" 
              onClick={handleCalculate}
              disabled={!customer || mwManaged === "" || !invoiceDate || calculating}
            >
              {calculating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Calculating...
                </>
              ) : (
                <>
                  <Calculator className="mr-2 h-4 w-4" />
                  Calculate Invoice
                </>
              )}
            </Button>
        </div>
        
        {showResult && result && (
          <div className="mt-6 border rounded-lg p-4">
            <h3 className="font-medium text-lg mb-2">Invoice Calculation Result</h3>
            <p className="text-sm text-muted-foreground mb-4">
              <span className="font-medium">Invoice Period:</span> {result.invoicePeriod || getInvoicePeriodText()}
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
                      <span>{item.moduleName} ({item.mw.toFixed(2)} MW × {selectedCustomer?.currency === 'USD' ? '$' : '€'}{item.rate}/MW/yr × {getPeriodMonthsMultiplier(billingFrequency)} months):</span>
                      <span>{formatCurrency(item.cost)}</span>
                    </div>
                  ))}
                </div>
                
                {selectedCustomer?.package === 'pro' && result.moduleCosts.reduce((sum, m) => sum + m.cost, 0) < (selectedCustomer.minimumAnnualValue || 5000) * getFrequencyMultiplier(billingFrequency) && (
                  <div className="text-sm pl-2 flex justify-between font-medium">
                    <span>Minimum Contract Value Applied:</span>
                    <span>{formatCurrency((selectedCustomer.minimumAnnualValue || 5000) * getFrequencyMultiplier(billingFrequency))}</span>
                  </div>
                )}
              </div>
            )}

            {result.hybridTieredBreakdown && (
              <div className="space-y-3 mb-4">
                <h4 className="font-medium text-sm">Hybrid Tiered Pricing:</h4>
                <div className="space-y-1 text-sm pl-2">
                  <div className="flex justify-between">
                    <span>On-Grid Sites ({result.hybridTieredBreakdown.ongrid.mw.toFixed(2)} MW × {selectedCustomer?.currency === 'USD' ? '$' : '€'}{result.hybridTieredBreakdown.ongrid.rate}/MW/yr × {getPeriodMonthsMultiplier(billingFrequency)} months):</span>
                    <span>{formatCurrency(result.hybridTieredBreakdown.ongrid.cost)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Hybrid Sites ({result.hybridTieredBreakdown.hybrid.mw.toFixed(2)} MW × {selectedCustomer?.currency === 'USD' ? '$' : '€'}{result.hybridTieredBreakdown.hybrid.rate}/MW/yr × {getPeriodMonthsMultiplier(billingFrequency)} months):</span>
                    <span>{formatCurrency(result.hybridTieredBreakdown.hybrid.cost)}</span>
                  </div>
                </div>
              </div>
            )}
            
            {result.addonCosts.length > 0 && (
              <div className="space-y-3 mb-4">
                <h4 className="font-medium text-sm">Add-on Costs:</h4>
                <div className="space-y-2 text-sm pl-2">
                  {result.addonCosts.map((item: any) => {
                    const addon = addons.find(a => a.id === item.addonId);
                    const quantity = item.quantity || addon?.quantity || 1;
                    return (
                      <div key={item.addonId} className="space-y-1">
                        <div className="flex justify-between">
                          <span>
                            {item.addonName}
                            {quantity > 1 && item.addonId === 'satelliteDataAPI' && item.pricePerUnit && (
                              <span className="text-muted-foreground">
                                {' '}({quantity} sites × {formatCurrency(item.pricePerUnit)}/mo × {getPeriodMonthsMultiplier(billingFrequency)} months)
                              </span>
                            )}
                            {quantity > 1 && item.addonId !== 'satelliteDataAPI' && (
                              <span className="text-muted-foreground">
                                {' '}({quantity} × {formatCurrency(item.cost / quantity / getFrequencyMultiplier(billingFrequency))})
                              </span>
                            )}:
                          </span>
                          <span className="font-medium">{formatCurrency(item.cost)}</span>
                        </div>
                        {/* Show tier details for tiered addons */}
                        {item.tierApplied && (
                          <div className="text-xs text-muted-foreground pl-2">
                            Tier: {item.tierApplied.label} @ {formatCurrency(item.pricePerUnit)}/site
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            {result.minimumCharges > 0 && (
              <div className="space-y-2 mb-3">
                <div className="flex justify-between text-sm">
                  <span>Minimum Charges{result.siteMinimumPricingBreakdown?.totalSitesOnMinimum ? ` (${result.siteMinimumPricingBreakdown.totalSitesOnMinimum} sites)` : ''}:</span>
                  <span>{formatCurrency(result.minimumCharges)}</span>
                </div>
                
                {/* Site-level breakdown if available */}
                {result.siteMinimumPricingBreakdown && (
                  <details className="text-xs bg-muted/30 p-3 rounded-md border">
                    <summary className="cursor-pointer font-medium mb-2">
                      View site pricing breakdown
                    </summary>
                    <div className="space-y-3 mt-2">
                      {result.siteMinimumPricingBreakdown.sitesBelowThreshold.length > 0 && (
                        <div>
                          <div className="font-medium mb-1 text-orange-600 dark:text-orange-400">
                            Sites using minimum pricing ({result.siteMinimumPricingBreakdown.sitesBelowThreshold.length}):
                          </div>
                          <div className="space-y-1 pl-2">
                            {result.siteMinimumPricingBreakdown.sitesBelowThreshold.map((site) => (
                              <div key={site.assetId} className="flex justify-between items-center py-1 border-b border-border/30">
                                <div className="flex-1">
                                  <div className="font-medium">{site.assetName}</div>
                                  <div className="text-muted-foreground">{site.mw.toFixed(2)} MWp</div>
                                </div>
                                <div className="text-right">
                                  <div className="line-through text-muted-foreground">{formatCurrency(site.calculatedCost)}</div>
                                  <div className="font-medium text-orange-600 dark:text-orange-400">{formatCurrency(site.minimumCharge)}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {result.siteMinimumPricingBreakdown.sitesAboveThreshold.length > 0 && (
                        <div>
                          <div className="font-medium mb-1 text-green-600 dark:text-green-400">
                            Sites using normal pricing ({result.siteMinimumPricingBreakdown.sitesAboveThreshold.length}):
                          </div>
                          <div className="space-y-1 pl-2">
                            {result.siteMinimumPricingBreakdown.sitesAboveThreshold.map((site) => (
                              <div key={site.assetId} className="flex justify-between items-center py-1 border-b border-border/30 last:border-b-0">
                                <div className="flex-1">
                                  <div className="font-medium">{site.assetName}</div>
                                  <div className="text-muted-foreground">{site.mw.toFixed(2)} MWp</div>
                                </div>
                                <div className="font-medium">{formatCurrency(site.calculatedCost)}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </details>
                )}
              </div>
            )}
            
            {result.minimumContractAdjustment && result.minimumContractAdjustment > 0 && (
              <div className="flex justify-between text-sm text-orange-600 dark:text-orange-400 mb-3">
                <span>Minimum Contract Value Adjustment:</span>
                <span className="font-medium">
                  {formatCurrency(result.minimumContractAdjustment)}
                </span>
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

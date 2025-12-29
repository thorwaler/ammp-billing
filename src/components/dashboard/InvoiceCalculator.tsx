
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Calculator, Send, ArrowRight, CalendarIcon, Loader2, ArrowUp, ArrowDown, FileText, Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { generateSupportDocumentData } from "@/lib/supportDocumentGenerator";
import { exportToExcel, exportToPDF, generateFilename } from "@/lib/supportDocumentExport";
import { SupportDocument } from "@/components/invoices/SupportDocument";
import { SupportDocumentDownloadDialog } from "@/components/invoices/SupportDocumentDownloadDialog";
import { getApplicableDiscount, SiteBillingItem } from "@/lib/invoiceCalculations";
import { SiteBillingSelector } from "@/components/invoices/SiteBillingSelector";
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
import { formatInTimeZone } from "date-fns-tz";
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
// Asset group filtering now handled server-side in ammp-sync-contract

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
  nickname?: string | null;
  companyName?: string;
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
  manualInvoicing?: boolean;
  baseMonthlyPrice?: number;
  siteChargeFrequency?: 'monthly' | 'annual';
  retainerHours?: number;
  retainerHourlyRate?: number;
  retainerMinimumValue?: number;
  // Per-site package fields
  onboardingFeePerSite?: number;
  annualFeePerSite?: number;
  contractId?: string;
  contractName?: string;
  // Elum package fields
  siteSizeThresholdKwp?: number;
  belowThresholdPricePerMWp?: number;
  aboveThresholdPricePerMWp?: number;
  ammpAssetGroupId?: string;
  ammpAssetGroupIdAnd?: string;
  ammpAssetGroupIdNot?: string;
  cachedCapabilities?: any;
  contractAmmpOrgId?: string;
  // Elum Internal fields
  graduatedMWTiers?: any[];
  // Custom asset discount pricing
  customAssetPricing?: any;
}

// Default modules and addons from shared data
const defaultModules: Module[] = MODULES.map(m => ({ ...m, selected: false }));
const defaultAddons: Addon[] = ADDONS.map(a => ({ ...a, selected: false }));

interface InvoiceCalculatorProps {
  preselectedCustomerId?: string;
  preselectedContractId?: string;
  prefilledDate?: Date;
  onInvoiceCreated?: () => void;
  onSupportDocumentReady?: (data: any) => void;
}

export function InvoiceCalculator({ 
  preselectedCustomerId,
  preselectedContractId,
  prefilledDate,
  onInvoiceCreated,
  onSupportDocumentReady
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
  
  // Format currency using the contract's currency, not user display preference
  const formatContractCurrency = (amount: number): string => {
    const symbol = selectedCustomer?.currency === 'USD' ? '$' : '€';
    return `${symbol}${amount.toLocaleString('en-US', { 
      minimumFractionDigits: 0, 
      maximumFractionDigits: 2 
    })}`;
  };
  const [generatingSupportDoc, setGeneratingSupportDoc] = useState(false);
  const [lastCreatedInvoiceId, setLastCreatedInvoiceId] = useState<string | null>(null);
  const [attachSupportDoc, setAttachSupportDoc] = useState(true);
  
  // Per-site billing state
  const [siteBillingData, setSiteBillingData] = useState<SiteBillingItem[]>([]);
  const [selectedSitesToBill, setSelectedSitesToBill] = useState<SiteBillingItem[]>([]);
  const [loadingSiteBilling, setLoadingSiteBilling] = useState(false);

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
          nickname,
          mwp_managed,
          ammp_capabilities,
          contracts (
            id,
            package,
            contract_name,
            company_name,
            modules,
            addons,
            custom_pricing,
            minimum_charge,
            minimum_charge_tiers,
            site_charge_frequency,
            portfolio_discount_tiers,
            minimum_annual_value,
            volume_discounts,
            currency,
            billing_frequency,
            manual_invoicing,
            base_monthly_price,
            period_start,
            period_end,
            retainer_hours,
            retainer_hourly_rate,
            retainer_minimum_value,
            onboarding_fee_per_site,
            annual_fee_per_site,
            site_size_threshold_kwp,
            below_threshold_price_per_mwp,
            above_threshold_price_per_mwp,
            ammp_asset_group_id,
            ammp_asset_group_id_and,
            ammp_asset_group_id_not,
            cached_capabilities,
            contract_ammp_org_id,
            graduated_mw_tiers,
            custom_asset_pricing
          )
        `)
        .eq('status', 'active');

      if (error) {
        console.error('Error loading customers:', error);
        return;
      }

      // Transform to Customer format
      const transformedCustomers: Customer[] = (data || [])
        .filter(c => c.contracts && c.contracts.length > 0)
        .map(c => {
          // Use preselected contract if provided, otherwise use first contract
          const contract = preselectedContractId 
            ? c.contracts.find((con: any) => con.id === preselectedContractId) || c.contracts[0]
            : c.contracts[0];
          const modules = Array.isArray(contract.modules) ? contract.modules as string[] : [];
          // Keep full addon objects with custom tiers instead of just IDs
          const addons = Array.isArray(contract.addons) ? contract.addons : [];
          const customPricing = typeof contract.custom_pricing === 'object' && contract.custom_pricing !== null ? contract.custom_pricing as {[key: string]: number} : {};
          const volumeDiscounts = typeof contract.volume_discounts === 'object' && contract.volume_discounts !== null ? contract.volume_discounts as any : {};
          const minimumChargeTiers = Array.isArray(contract.minimum_charge_tiers) ? contract.minimum_charge_tiers : [];
          const portfolioDiscountTiers = Array.isArray(contract.portfolio_discount_tiers) ? contract.portfolio_discount_tiers : [];
          const siteChargeFrequency = contract.site_charge_frequency || "annual";
          
          // Use contract-level cached_capabilities as primary source (contract-centric architecture)
          const cachedCaps = (contract as any).cached_capabilities;
          
          return {
            id: c.id,
            name: c.name,
            nickname: c.nickname,
            companyName: (contract as any).company_name || undefined,
            package: contract.package as PackageType,
            mwManaged: cachedCaps?.totalMW || Number(c.mwp_managed) || 0,
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
            ammpCapabilities: cachedCaps || c.ammp_capabilities || null,
            manualInvoicing: contract.manual_invoicing || false,
            baseMonthlyPrice: Number(contract.base_monthly_price) || 0,
            siteChargeFrequency: siteChargeFrequency as 'monthly' | 'annual',
            periodStart: contract.period_start,
            periodEnd: contract.period_end,
            retainerHours: Number((contract as any).retainer_hours) || 0,
            retainerHourlyRate: Number((contract as any).retainer_hourly_rate) || 0,
            retainerMinimumValue: Number((contract as any).retainer_minimum_value) || 0,
            // Per-site package fields
            onboardingFeePerSite: Number((contract as any).onboarding_fee_per_site) || 1000,
            annualFeePerSite: Number((contract as any).annual_fee_per_site) || 1000,
            contractId: contract.id,
            contractName: (contract as any).contract_name || undefined,
            // Elum package fields
            siteSizeThresholdKwp: Number((contract as any).site_size_threshold_kwp) || 100,
            belowThresholdPricePerMWp: Number((contract as any).below_threshold_price_per_mwp) || 50,
            aboveThresholdPricePerMWp: Number((contract as any).above_threshold_price_per_mwp) || 30,
            ammpAssetGroupId: (contract as any).ammp_asset_group_id || undefined,
            ammpAssetGroupIdAnd: (contract as any).ammp_asset_group_id_and || undefined,
            ammpAssetGroupIdNot: (contract as any).ammp_asset_group_id_not || undefined,
            cachedCapabilities: (contract as any).cached_capabilities || undefined,
            contractAmmpOrgId: (contract as any).contract_ammp_org_id || undefined,
            // Elum Internal fields
            graduatedMWTiers: Array.isArray((contract as any).graduated_mw_tiers) 
              ? (contract as any).graduated_mw_tiers 
              : undefined,
            // Custom asset pricing
            customAssetPricing: (contract as any).custom_asset_pricing || undefined,
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

  // Fetch site billing status for per_site packages
  useEffect(() => {
    const fetchSiteBillingStatus = async () => {
      if (!selectedCustomer || selectedCustomer.package !== 'per_site' || !selectedCustomer.contractId) {
        setSiteBillingData([]);
        setSelectedSitesToBill([]);
        return;
      }
      
      setLoadingSiteBilling(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        const { data: sites, error } = await supabase
          .from('site_billing_status')
          .select('*')
          .eq('contract_id', selectedCustomer.contractId)
          .eq('user_id', user.id);
        
        if (error) {
          console.error('Error fetching site billing status:', error);
          return;
        }
        
        if (!sites || sites.length === 0) {
          // No site billing records - might need AMMP sync
          console.log('No site billing records found for contract');
          setSiteBillingData([]);
          setSelectedSitesToBill([]);
          return;
        }
        
        // Determine which sites need billing
        const currentDate = invoiceDate || new Date();
        
        const siteBillingItems: SiteBillingItem[] = sites.map(site => {
        const needsOnboarding = !site.onboarding_fee_paid;
          // If site needs onboarding, also charge the first year's annual fee upfront
          // Otherwise, check if annual renewal is due based on next_annual_due_date
          const needsAnnualRenewal = needsOnboarding 
            ? true  // New sites get annual fee charged upfront with onboarding
            : (site.next_annual_due_date 
                ? new Date(site.next_annual_due_date) <= currentDate
                : false);
          
          return {
            assetId: site.asset_id,
            assetName: site.asset_name,
            capacityKwp: site.asset_capacity_kwp || undefined,
            onboardingDate: site.onboarding_date || undefined,
            needsOnboarding,
            needsAnnualRenewal
          };
        });
        
        setSiteBillingData(siteBillingItems);
        
        // Auto-select sites that need billing
        const sitesToBill = siteBillingItems.filter(s => s.needsOnboarding || s.needsAnnualRenewal);
        setSelectedSitesToBill(sitesToBill);
        
      } catch (error) {
        console.error('Error fetching site billing status:', error);
      } finally {
        setLoadingSiteBilling(false);
      }
    };
    
    fetchSiteBillingStatus();
  }, [selectedCustomer?.id, selectedCustomer?.package, selectedCustomer?.contractId, invoiceDate]);

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
    invoiceDate,
    selectedCustomer   // Customer data including period dates
  ]);

  // Calculation helper - now using shared logic
  const getInvoicePeriodText = () => {
    if (!invoiceDate) return "";
    
    // Use contract period dates if available (preferred)
    if (selectedCustomer?.periodStart && selectedCustomer?.periodEnd) {
      // Parse dates as local to avoid timezone shifts
      // Extract YYYY-MM-DD portion to create local dates
      const startStr = selectedCustomer.periodStart.split('T')[0] || selectedCustomer.periodStart.substring(0, 10);
      const endStr = selectedCustomer.periodEnd.split('T')[0] || selectedCustomer.periodEnd.substring(0, 10);
      
      // Create dates as local (not UTC) by parsing YYYY-MM-DD format
      const [startYear, startMonth, startDay] = startStr.split('-').map(Number);
      const [endYear, endMonth, endDay] = endStr.split('-').map(Number);
      
      const startDate = new Date(startYear, startMonth - 1, startDay);
      const endDate = new Date(endYear, endMonth - 1, endDay);
      
      return `${format(startDate, 'PPP')} - ${format(endDate, 'PPP')}`;
    }
    
    // Fallback: Calculate period with proper month boundaries
    const invoiceDateObj = new Date(invoiceDate);
    let startDate: Date;
    let endDate: Date;
    
    if (billingFrequency === "quarterly") {
      // Quarterly is retrospective: period ends in the month before invoice, starts 3 months prior
      // End date: last day of the previous month
      endDate = new Date(invoiceDateObj.getFullYear(), invoiceDateObj.getMonth(), 0); // Last day of previous month
      // Start date: 1st of the month, 3 months before end month
      startDate = new Date(endDate.getFullYear(), endDate.getMonth() - 2, 1); // 1st of start month
    } else if (billingFrequency === "monthly") {
      // Monthly: current month
      startDate = new Date(invoiceDateObj.getFullYear(), invoiceDateObj.getMonth(), 1);
      endDate = new Date(invoiceDateObj.getFullYear(), invoiceDateObj.getMonth() + 1, 0); // Last day of month
    } else if (billingFrequency === "biannual") {
      // Biannual: 6 month period starting from current month
      startDate = new Date(invoiceDateObj.getFullYear(), invoiceDateObj.getMonth(), 1);
      endDate = new Date(invoiceDateObj.getFullYear(), invoiceDateObj.getMonth() + 6, 0); // Last day of 6th month
    } else {
      // Annual: 12 month period starting from current month
      startDate = new Date(invoiceDateObj.getFullYear(), invoiceDateObj.getMonth(), 1);
      endDate = new Date(invoiceDateObj.getFullYear() + 1, invoiceDateObj.getMonth(), 0); // Last day before anniversary
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
      minimumContractAdjustment: 0,
      basePricingCost: 0,
      retainerCost: 0,
      retainerCalculatedCost: 0,
      retainerMinimumApplied: false,
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
      
      // Handle both field naming conventions (ongridTotalMW/hybridTotalMW and ongridMW/hybridMW)
      const ongridMW = capabilities?.ongridTotalMW ?? capabilities?.ongridMW ?? 0;
      const hybridMW = capabilities?.hybridTotalMW ?? capabilities?.hybridMW ?? 0;
      
      if (capabilities && (ongridMW > 0 || hybridMW > 0)) {
        
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
      
      // Note: Minimum annual contract value for Pro/Custom packages is now handled
      // by the shared calculateInvoice() function via minimumContractAdjustment
    }
    
    // Prepare asset breakdown for site-level pricing
    // Always use cached_capabilities from contract (single source of truth)
    const effectiveCapabilities = selectedCustomer.cachedCapabilities;
    
    const assetBreakdown = effectiveCapabilities?.assetBreakdown?.map((asset: any) => ({
      assetId: asset.assetId,
      assetName: asset.assetName,
      totalMW: asset.totalMW,
      isHybrid: asset.isHybrid,
      hasSolcast: asset.hasSolcast,
      solcastOnboardingDate: asset.solcastOnboardingDate,
      onboardingDate: asset.onboardingDate
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
      ammpCapabilities: effectiveCapabilities,
      assetBreakdown,
      enableSiteMinimumPricing: enableSiteMinPricing,
      baseMonthlyPrice: selectedCustomer.baseMonthlyPrice,
      siteChargeFrequency: (selectedCustomer as any).siteChargeFrequency || "annual",
      retainerHours: selectedCustomer.retainerHours,
      retainerHourlyRate: selectedCustomer.retainerHourlyRate,
      retainerMinimumValue: selectedCustomer.retainerMinimumValue,
      // Per-site package fields
      onboardingFeePerSite: selectedCustomer.onboardingFeePerSite,
      annualFeePerSite: selectedCustomer.annualFeePerSite,
      sitesToBill: selectedCustomer.package === 'per_site' ? selectedSitesToBill : undefined,
      // Elum package fields
      siteSizeThresholdKwp: selectedCustomer.siteSizeThresholdKwp,
      belowThresholdPricePerMWp: selectedCustomer.belowThresholdPricePerMWp,
      aboveThresholdPricePerMWp: selectedCustomer.aboveThresholdPricePerMWp,
      // Elum Internal fields
      graduatedMWTiers: selectedCustomer.graduatedMWTiers,
      // Custom asset discount pricing
      customAssetPricing: selectedCustomer.customAssetPricing,
      // Pro-rata Solcast calculation fields
      invoiceDate,
      periodStart: selectedCustomer.periodStart,
      periodEnd: selectedCustomer.periodEnd,
    };
    
    calculationResult = calculateInvoice(params);
    
    // Debug logging for minimum contract adjustment
    console.log('Invoice Calculation Debug:', {
      package: selectedCustomer.package,
      minimumAnnualValue: selectedCustomer.minimumAnnualValue,
      frequencyMultiplier,
      baseCost: calculationResult.totalMWCost + calculationResult.minimumCharges,
      minimumContractAdjustment: calculationResult.minimumContractAdjustment,
      totalPrice: calculationResult.totalPrice
    });
    
    // Note: Addon costs are now calculated by the shared calculateInvoice() function
    // No need to recalculate them here
    
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
      const lineItems = [];
      
      // Account code constants:
      // 1002 = Platform Fees (ARR - MW-based pricing)
      // 1000 = Implementation Fees (NRR - addons)
      const ACCOUNT_PLATFORM_FEES = "1002";
      const ACCOUNT_IMPLEMENTATION_FEES = "1000";

      // Add base pricing if applicable (Platform Fee - ARR)
      if (result.basePricingCost > 0) {
        lineItems.push({
          Description: "Base Pricing",
          Quantity: 1,
          UnitAmount: result.basePricingCost,
          AccountCode: ACCOUNT_PLATFORM_FEES
        });
      }

      // Add module costs (Platform Fees - ARR)
      // When site minimum pricing is active, use the breakdown instead of moduleCosts
      // Only use threshold wording when there are ACTUALLY sites below threshold (mixed pricing)
      if (result.siteMinimumPricingBreakdown && result.siteMinimumPricingBreakdown.sitesBelowThreshold.length > 0) {
        // Sites above threshold (normal pricing)
        if (result.siteMinimumPricingBreakdown.normalPricingTotal > 0) {
          lineItems.push({
            Description: `Monitoring Fee - Sites Above Threshold (${result.siteMinimumPricingBreakdown.sitesAboveThreshold.length} sites)`,
            Quantity: 1,
            UnitAmount: result.siteMinimumPricingBreakdown.normalPricingTotal,
            AccountCode: ACCOUNT_PLATFORM_FEES
          });
        }
        // Sites below threshold (minimum pricing)
        if (result.siteMinimumPricingBreakdown.minimumPricingTotal > 0) {
          lineItems.push({
            Description: `Monitoring Fee - Sites Below Threshold (${result.siteMinimumPricingBreakdown.sitesBelowThreshold.length} sites, minimum charge)`,
            Quantity: 1,
            UnitAmount: result.siteMinimumPricingBreakdown.minimumPricingTotal,
            AccountCode: ACCOUNT_PLATFORM_FEES
          });
        }
      } else {
        // Standard module costs (no threshold wording)
        result.moduleCosts.forEach(mc => {
          lineItems.push({
            Description: mc.moduleName,
            Quantity: 1,
            UnitAmount: mc.cost,
            AccountCode: ACCOUNT_PLATFORM_FEES
          });
        });
        
        // Add minimum charges as separate line item (for contracts with ONLY per-site charges)
        if (result.minimumCharges > 0) {
          lineItems.push({
            Description: "Minimum Charges",
            Quantity: 1,
            UnitAmount: result.minimumCharges,
            AccountCode: ACCOUNT_PLATFORM_FEES
          });
        }
      }
      
      // Add hybrid tiered pricing line items (for hybrid_tiered packages like BLS)
      if (result.hybridTieredBreakdown) {
        if (result.hybridTieredBreakdown.ongrid.cost > 0) {
          lineItems.push({
            Description: `On-Grid Sites Monitoring (${result.hybridTieredBreakdown.ongrid.mw.toFixed(2)} MW)`,
            Quantity: 1,
            UnitAmount: result.hybridTieredBreakdown.ongrid.cost,
            AccountCode: ACCOUNT_PLATFORM_FEES
          });
        }
        if (result.hybridTieredBreakdown.hybrid.cost > 0) {
          lineItems.push({
            Description: `Hybrid Sites Monitoring (${result.hybridTieredBreakdown.hybrid.mw.toFixed(2)} MW)`,
            Quantity: 1,
            UnitAmount: result.hybridTieredBreakdown.hybrid.cost,
            AccountCode: ACCOUNT_PLATFORM_FEES
          });
        }
      }
      
      // Add Elum Internal graduated MW tier line items
      if (result.elumInternalBreakdown) {
        result.elumInternalBreakdown.tiers.forEach((tier: any) => {
          if (tier.cost > 0) {
            lineItems.push({
              Description: `${tier.label || `${tier.minMW}-${tier.maxMW === Infinity ? '∞' : tier.maxMW} MW`} (${tier.mwInTier.toFixed(2)} MW × €${tier.pricePerMW}/MW)`,
              Quantity: 1,
              UnitAmount: tier.cost,
              AccountCode: ACCOUNT_PLATFORM_FEES
            });
          }
        });
      }
      
      // Add Elum ePM site pricing line items
      if (result.elumEpmBreakdown) {
        if (result.elumEpmBreakdown.smallSitesTotal > 0) {
          lineItems.push({
            Description: `Small Sites ≤${result.elumEpmBreakdown.threshold}kWp (${result.elumEpmBreakdown.smallSites?.length || 0} sites)`,
            Quantity: 1,
            UnitAmount: result.elumEpmBreakdown.smallSitesTotal,
            AccountCode: ACCOUNT_PLATFORM_FEES
          });
        }
        if (result.elumEpmBreakdown.largeSitesTotal > 0) {
          lineItems.push({
            Description: `Large Sites >${result.elumEpmBreakdown.threshold}kWp (${result.elumEpmBreakdown.largeSites?.length || 0} sites)`,
            Quantity: 1,
            UnitAmount: result.elumEpmBreakdown.largeSitesTotal,
            AccountCode: ACCOUNT_PLATFORM_FEES
          });
        }
      }
      
      // Add Elum Jubaili per-site fee line item
      if (result.elumJubailiBreakdown) {
        lineItems.push({
          Description: `Per-Site Fee (${result.elumJubailiBreakdown.siteCount} sites × €${result.elumJubailiBreakdown.perSiteFee}/site)`,
          Quantity: 1,
          UnitAmount: result.elumJubailiBreakdown.totalCost,
          AccountCode: ACCOUNT_PLATFORM_FEES
        });
      }
      
      // Add discounted assets line items (Platform Fees - ARR)
      if (result.discountedAssets && result.discountedAssets.length > 0) {
        result.discountedAssets.forEach(asset => {
          const mwDisplay = asset.mw ? ` (${asset.mw.toFixed(2)} MW)` : '';
          lineItems.push({
            Description: `Discounted Rate - ${asset.assetName}${mwDisplay}`,
            Quantity: 1,
            UnitAmount: asset.cost,
            AccountCode: ACCOUNT_PLATFORM_FEES
          });
        });
      }
      
      // Add addon costs - Solcast is ARR (recurring), other addons are NRR
      result.addonCosts.forEach(ac => {
        // Solcast (Satellite Data API) is recurring revenue - ARR
        const accountCode = ac.addonId === 'satelliteDataAPI' 
          ? ACCOUNT_PLATFORM_FEES  // 1002 - ARR
          : ACCOUNT_IMPLEMENTATION_FEES;  // 1000 - NRR
        
        lineItems.push({
          Description: ac.addonName,
          Quantity: 1,
          UnitAmount: ac.cost,
          AccountCode: accountCode
        });
      });
      
      if (result.starterPackageCost > 0) {
        lineItems.unshift({
          Description: "AMMP OS Starter Package",
          Quantity: 1,
          UnitAmount: result.starterPackageCost,
          AccountCode: ACCOUNT_PLATFORM_FEES
        });
      }
      
      // Add minimum contract adjustment if present (Platform Fee - ARR)
      if (result.minimumContractAdjustment && result.minimumContractAdjustment > 0) {
        lineItems.push({
          Description: "Minimum Contract Value Adjustment",
          Quantity: 1,
          UnitAmount: result.minimumContractAdjustment,
          AccountCode: ACCOUNT_PLATFORM_FEES
        });
      }
      
      // Add retainer cost (Platform Fee - ARR)
      if (result.retainerCost > 0) {
        const description = result.retainerMinimumApplied
          ? `Retainer (Minimum charge applied)`
          : `Retainer Hours (${selectedCustomer.retainerHours || 0} hours)`;
        lineItems.push({
          Description: description,
          Quantity: 1,
          UnitAmount: result.retainerCost,
          AccountCode: ACCOUNT_PLATFORM_FEES
        });
      }
      
      // Add per-site billing line items (Platform Fee - ARR)
      if (result.perSiteBreakdown) {
        if (result.perSiteBreakdown.onboardingCost > 0) {
          lineItems.push({
            Description: `Site Onboarding Fees (${result.perSiteBreakdown.sitesOnboarded} sites)`,
            Quantity: result.perSiteBreakdown.sitesOnboarded,
            UnitAmount: selectedCustomer.onboardingFeePerSite || 1000,
            AccountCode: ACCOUNT_PLATFORM_FEES
          });
        }
        if (result.perSiteBreakdown.annualSubscriptionCost > 0) {
          lineItems.push({
            Description: `Annual Subscription Fees (${result.perSiteBreakdown.sitesRenewed} sites)`,
            Quantity: result.perSiteBreakdown.sitesRenewed,
            UnitAmount: selectedCustomer.annualFeePerSite || 1000,
            AccountCode: ACCOUNT_PLATFORM_FEES
          });
        }
      }
      
      // Get Solcast addon cost separately (it's ARR, not NRR)
      const solcastCost = result.addonCosts.find(ac => ac.addonId === 'satelliteDataAPI')?.cost || 0;

      // Calculate ARR (Platform Fees - all MW-based pricing + Solcast)
      const arrAmount = (result.basePricingCost || 0) +
        (result.starterPackageCost || 0) +
        result.moduleCosts.reduce((sum, mc) => sum + mc.cost, 0) +
        // Hybrid tiered pricing (BLS and similar)
        (result.hybridTieredBreakdown?.ongrid.cost || 0) +
        (result.hybridTieredBreakdown?.hybrid.cost || 0) +
        // Elum package costs are ARR
        (result.elumInternalBreakdown?.totalCost || 0) +
        (result.elumEpmBreakdown?.totalCost || 0) +
        (result.elumJubailiBreakdown?.totalCost || 0) +
        (result.minimumContractAdjustment || 0) +
        (result.minimumCharges || 0) +
        (result.retainerCost || 0) +
        // Discounted assets are ARR
        (result.discountedAssetsTotal || 0) +
        // Per-site fees are ARR
        (result.perSiteBreakdown?.onboardingCost || 0) +
        (result.perSiteBreakdown?.annualSubscriptionCost || 0) +
        // Solcast is recurring revenue - ARR
        solcastCost;

      // Calculate NRR (Implementation Fees - addons EXCEPT Solcast)
      const nrrAmount = result.addonCosts
        .filter(ac => ac.addonId !== 'satelliteDataAPI')
        .reduce((sum, ac) => sum + ac.cost, 0);
      
      const xeroInvoice = {
        Type: "ACCREC",
        Contact: { Name: selectedCustomer.name },
        Date: format(invoiceDate, "yyyy-MM-dd"),
        DueDate: format(new Date(invoiceDate.getTime() + 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"), // 30 days from invoice date
        LineItems: lineItems,
        Reference: selectedCustomer.contractName 
          ? `${selectedCustomer.contractName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-').substring(0, 30)}-${format(invoiceDate, "yyyyMMdd")}`
          : `${selectedCustomer.nickname || selectedCustomer.companyName || selectedCustomer.name}-${format(invoiceDate, "yyyyMMdd")}`,
        CurrencyCode: selectedCustomer.currency,
        Status: "DRAFT"
      };
      
      // Generate support document data before sending
      const discountPercent = selectedCustomer.portfolioDiscountTiers?.length > 0
        ? getApplicableDiscount(Number(mwManaged), selectedCustomer.portfolioDiscountTiers)
        : 0;
      const effectiveCapabilities = (selectedCustomer.ammpAssetGroupId || selectedCustomer.contractAmmpOrgId) 
        && selectedCustomer.cachedCapabilities 
        ? selectedCustomer.cachedCapabilities 
        : selectedCustomer.ammpCapabilities;
      
      const supportDocData = await generateSupportDocumentData(
        selectedCustomer.id,
        selectedCustomer.nickname || selectedCustomer.name,
        selectedCustomer.currency,
        invoiceDate,
        result,
        modules.filter(m => m.selected).map(m => m.id),
        addons.filter(a => a.selected).map(a => ({ id: a.id, quantity: a.quantity })),
        effectiveCapabilities,
        selectedCustomer.package,
        billingFrequency,
        discountPercent,
        selectedCustomer.periodStart,
        selectedCustomer.periodEnd,
        selectedCustomer.contractId,
        selectedCustomer.retainerHours,
        selectedCustomer.retainerHourlyRate,
        selectedCustomer.retainerMinimumValue,
        selectedCustomer.contractName,
        selectedCustomer.minimumAnnualValue
      );

      const { data, error } = await supabase.functions.invoke('xero-send-invoice', {
        body: { 
          invoice: xeroInvoice,
          attachSupportDoc: attachSupportDoc,
          supportDocumentData: supportDocData
        }
      });

      if (error) throw error;
      
      // Extract Xero invoice ID from response
      const xeroInvoiceId = data?.invoice?.Invoices?.[0]?.InvoiceID;
      
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
        
        // Subtract 1 day to get the last day of the period (not first day of next)
        nextPeriodEnd.setDate(nextPeriodEnd.getDate() - 1);
        
        await supabase
          .from('contracts')
          .update({
            period_start: nextPeriodStart.toISOString(),
            period_end: nextPeriodEnd.toISOString(),
            next_invoice_date: nextPeriodEnd.toISOString()
          })
          .eq('id', selectedCustomer.contractId);
      }
      
      // Save invoice record to database for history tracking
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Recalculate ARR/NRR for storage - Solcast is ARR, not NRR
        const storedSolcastCost = result.addonCosts.find(ac => ac.addonId === 'satelliteDataAPI')?.cost || 0;
        const storedArrAmount = (result.basePricingCost || 0) +
          (result.starterPackageCost || 0) +
          result.moduleCosts.reduce((sum, mc) => sum + mc.cost, 0) +
          // Hybrid tiered pricing (BLS and similar)
          (result.hybridTieredBreakdown?.ongrid.cost || 0) +
          (result.hybridTieredBreakdown?.hybrid.cost || 0) +
          // Elum package costs are ARR
          (result.elumInternalBreakdown?.totalCost || 0) +
          (result.elumEpmBreakdown?.totalCost || 0) +
          (result.elumJubailiBreakdown?.totalCost || 0) +
          (result.minimumContractAdjustment || 0) +
          (result.minimumCharges || 0) +
          (result.retainerCost || 0) +
          // Discounted assets are ARR
          (result.discountedAssetsTotal || 0) +
          // Per-site fees are ARR
          (result.perSiteBreakdown?.onboardingCost || 0) +
          (result.perSiteBreakdown?.annualSubscriptionCost || 0) +
          // Solcast is recurring revenue - ARR
          storedSolcastCost;
        const storedNrrAmount = result.addonCosts
          .filter(ac => ac.addonId !== 'satelliteDataAPI')
          .reduce((sum, ac) => sum + ac.cost, 0);

        const { data: insertedInvoice, error: invoiceError } = await supabase
          .from('invoices')
          .insert([{
            user_id: user.id,
            customer_id: selectedCustomer.id,
            contract_id: selectedCustomer.contractId || null,
            invoice_date: invoiceDate.toISOString(),
            xero_invoice_id: xeroInvoiceId || null,
            billing_frequency: billingFrequency,
            mw_managed: Number(mwManaged),
            mw_change: mwChange,
            total_mw: Number(mwManaged),
            invoice_amount: result.totalPrice,
            currency: selectedCustomer.currency,
            modules_data: modules.filter(m => m.selected) as any,
            // Merge calculated addon costs into addons data - ensures pro-rata Solcast cost is stored correctly
            addons_data: addons.filter(a => a.selected).map(addon => {
              const calculatedAddon = result.addonCosts.find(ac => ac.addonId === addon.id);
              return {
                ...addon,
                cost: calculatedAddon?.cost || addon.calculatedTieredPrice?.totalPrice || 0
              };
            }) as any,
            source: 'internal',
            arr_amount: storedArrAmount,
            nrr_amount: storedNrrAmount,
            xero_line_items: lineItems
          }])
          .select()
          .single();

        if (invoiceError) {
          console.error('Failed to save invoice record:', invoiceError);
          // Don't fail the whole operation, just log
        } else {
          // Store invoice ID for support document generation
          setLastCreatedInvoiceId(insertedInvoice.id);
          
          // Update customer's last_invoiced date
          await supabase
            .from('customers')
            .update({ last_invoiced: invoiceDate.toISOString() })
            .eq('id', selectedCustomer.id);
          
          // Check MW capacity for capped contracts
          if (selectedCustomer.contractId) {
            await monitorMWAndNotify(
              user.id,
              selectedCustomer.contractId,
              selectedCustomer.nickname || selectedCustomer.name,
              Number(mwManaged)
            );
          }
          
          // Update site_billing_status for per_site packages
          if (selectedCustomer.package === 'per_site' && selectedSitesToBill.length > 0) {
            const now = new Date().toISOString();
            
            for (const site of selectedSitesToBill) {
              const updates: any = {};
              
              if (site.needsOnboarding) {
                updates.onboarding_fee_paid = true;
                updates.onboarding_fee_paid_date = now;
                updates.onboarding_invoice_id = insertedInvoice.id;
              }
              
              if (site.needsAnnualRenewal) {
                updates.last_annual_payment_date = now;
                updates.last_annual_invoice_id = insertedInvoice.id;
                // Set next annual due date to 1 year from now
                const nextDue = new Date();
                nextDue.setFullYear(nextDue.getFullYear() + 1);
                updates.next_annual_due_date = nextDue.toISOString();
              }
              
              if (Object.keys(updates).length > 0) {
                await supabase
                  .from('site_billing_status')
                  .update(updates)
                  .eq('asset_id', site.assetId)
                  .eq('contract_id', selectedCustomer.contractId);
              }
            }
            
            console.log(`[Invoice] Updated site_billing_status for ${selectedSitesToBill.length} sites`);
          }
          
          // Generate support document data and store it
          await generateAndStoreSupportDocument(insertedInvoice.id);
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
        setSiteBillingData([]);
        setSelectedSitesToBill([]);
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

  const generateAndStoreSupportDocument = async (invoiceId: string) => {
    if (!result || !selectedCustomer || !invoiceDate) return;
    
    setGeneratingSupportDoc(true);
    
    try {
      // Calculate discount percentage
      const discountPercent = selectedCustomer.portfolioDiscountTiers && selectedCustomer.portfolioDiscountTiers.length > 0
        ? getApplicableDiscount(Number(mwManaged), selectedCustomer.portfolioDiscountTiers)
        : 0;
      
      // Determine effective capabilities (use cached for whitelabel contracts)
      const usesContractLevelSyncForDoc = !!(
        selectedCustomer.ammpAssetGroupId || 
        selectedCustomer.contractAmmpOrgId
      );
      const effectiveCapabilitiesForDoc = usesContractLevelSyncForDoc && selectedCustomer.cachedCapabilities
        ? selectedCustomer.cachedCapabilities
        : selectedCustomer.ammpCapabilities;

      // Generate support document data
      const docData = await generateSupportDocumentData(
        selectedCustomer.id,
        selectedCustomer.nickname || selectedCustomer.name,
        selectedCustomer.currency,
        invoiceDate,
        result,
        modules.filter(m => m.selected).map(m => m.id),
        addons.filter(a => a.selected).map(a => ({ id: a.id, quantity: a.quantity })),
        effectiveCapabilitiesForDoc,
        selectedCustomer.package,
        billingFrequency,
        discountPercent,
        selectedCustomer.periodStart,
        selectedCustomer.periodEnd,
        selectedCustomer.contractId, // Fix #3: Filter YTD by contract
        selectedCustomer.retainerHours, // Fix #5: Pass retainer params
        selectedCustomer.retainerHourlyRate,
        selectedCustomer.retainerMinimumValue,
        selectedCustomer.contractName, // Add contract name to support document
        selectedCustomer.minimumAnnualValue // Pass minimum annual value for PDF display
      );
      
      // Validate totals (show warning but continue)
      if (!docData.totalsMatch) {
        toast({
          title: "Total Mismatch Note",
          description: `Calculated breakdown (${formatCurrency(docData.calculatedTotal)}) differs from invoice total (${formatCurrency(docData.invoiceTotal)}). This may be due to rounding or custom pricing.`,
          variant: "default",
        });
      }
      
      // Store support document data in database (always)
      const { error: updateError } = await supabase
        .from('invoices')
        .update({ support_document_data: docData as any })
        .eq('id', invoiceId);
      
      if (updateError) {
        console.error('Failed to store support document data:', updateError);
        toast({
          title: "Support Document Warning",
          description: "Failed to store support document data. You can still download it from invoice history later.",
          variant: "destructive",
        });
      } else {
        // Notify parent component about support document ready
        onSupportDocumentReady?.(docData);
      }
      
      setGeneratingSupportDoc(false);
      
    } catch (error) {
      console.error('Error generating support document:', error);
      toast({
        title: "Support Document Error",
        description: "Failed to generate support document. The invoice was still created successfully.",
        variant: "destructive",
      });
      setGeneratingSupportDoc(false);
    }
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
                        {invoiceDate ? formatInTimeZone(invoiceDate, 'Europe/Amsterdam', "PPP") : "Select date"}
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
              
              {/* Per-site billing selector for per_site packages */}
              {selectedCustomer.package === 'per_site' && (
                <div className="space-y-2">
                  {loadingSiteBilling ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading site billing status...
                    </div>
                  ) : siteBillingData.length === 0 ? (
                    <Card className="border-dashed">
                      <CardContent className="pt-6">
                        <p className="text-muted-foreground text-center text-sm">
                          No site billing records found. Please sync AMMP data first to populate site billing status.
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    <SiteBillingSelector
                      sites={siteBillingData}
                      selectedSites={selectedSitesToBill}
                      onSelectionChange={setSelectedSitesToBill}
                      onboardingFee={selectedCustomer.onboardingFeePerSite || 1000}
                      annualFee={selectedCustomer.annualFeePerSite || 1000}
                      currency={selectedCustomer.currency}
                    />
                  )}
                </div>
              )}
              
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
                  {addons.map(addon => (
                      <div key={addon.id} className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            id={`addon-${addon.id}`}
                            checked={addon.selected}
                            onCheckedChange={() => handleAddonToggle(addon.id)}
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
                  <span>{formatContractCurrency(result.starterPackageCost)}</span>
                </div>
              </div>
            )}
            
            {selectedCustomer?.package !== 'starter' && (result.moduleCosts.length > 0 || result.siteMinimumPricingBreakdown) && (
              <div className="space-y-3 mb-4">
                <h4 className="font-medium text-sm">Module Costs:</h4>
                <div className="space-y-1 text-sm pl-2">
                  {/* Show site-aware breakdown ONLY when there are actually sites below threshold */}
                  {result.siteMinimumPricingBreakdown && result.siteMinimumPricingBreakdown.sitesBelowThreshold.length > 0 ? (
                    <>
                      {result.siteMinimumPricingBreakdown.sitesAboveThreshold.length > 0 && (
                        <div className="flex justify-between">
                          <span>
                            Sites above threshold ({result.siteMinimumPricingBreakdown.sitesAboveThreshold.length} sites, {result.siteMinimumPricingBreakdown.sitesAboveThreshold.reduce((sum, s) => sum + s.mw, 0).toFixed(2)} MW × {formatContractCurrency(result.moduleCosts[0]?.rate || 0)}/MW/yr × {getPeriodMonthsMultiplier(billingFrequency)} months):
                          </span>
                          <span>{formatContractCurrency(result.siteMinimumPricingBreakdown.normalPricingTotal)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-orange-600 dark:text-orange-400">
                        <span>
                          Sites on minimum pricing ({result.siteMinimumPricingBreakdown.sitesBelowThreshold.length} sites × min charge):
                        </span>
                        <span>{formatContractCurrency(result.siteMinimumPricingBreakdown.minimumPricingTotal)}</span>
                      </div>
                      <div className="flex justify-between font-medium border-t border-border pt-1 mt-1">
                        <span>Total Portfolio Pricing:</span>
                        <span>{formatContractCurrency(result.siteMinimumPricingBreakdown.normalPricingTotal + result.siteMinimumPricingBreakdown.minimumPricingTotal)}</span>
                      </div>
                    </>
                  ) : result.siteMinimumPricingBreakdown && result.siteMinimumPricingBreakdown.sitesAboveThreshold.length === 0 ? (
                    /* ALL sites on minimum pricing (no MW-based pricing) - show total prominently */
                    <div className="flex justify-between font-medium">
                      <span>Site Minimum Charges ({result.siteMinimumPricingBreakdown.sitesBelowThreshold.length} sites):</span>
                      <span>{formatContractCurrency(result.siteMinimumPricingBreakdown.minimumPricingTotal)}</span>
                    </div>
                  ) : (
                    /* Standard module costs display when no site minimum pricing */
                    result.moduleCosts.map((item) => (
                      <div key={item.moduleId} className="flex justify-between">
                        <span>{item.moduleName} ({item.mw.toFixed(2)} MW × {formatContractCurrency(item.rate)}/MW/yr × {getPeriodMonthsMultiplier(billingFrequency)} months):</span>
                        <span>{formatContractCurrency(item.cost)}</span>
                      </div>
                    ))
                  )}
                </div>
                
            {(selectedCustomer?.package === 'pro' || selectedCustomer?.package === 'elum_portfolio_os') && !result.siteMinimumPricingBreakdown && result.moduleCosts.reduce((sum, m) => sum + m.cost, 0) < (selectedCustomer.minimumAnnualValue || 0) * getFrequencyMultiplier(billingFrequency) && (selectedCustomer.minimumAnnualValue || 0) > 0 && (
                  <div className="text-sm pl-2 flex justify-between font-medium">
                    <span>Minimum Contract Value Applied:</span>
                    <span>{formatContractCurrency((selectedCustomer.minimumAnnualValue || 0) * getFrequencyMultiplier(billingFrequency))}</span>
                  </div>
                )}
              </div>
            )}

            {result.hybridTieredBreakdown && (
              <div className="space-y-3 mb-4">
                <h4 className="font-medium text-sm">Hybrid Tiered Pricing:</h4>
                <div className="space-y-1 text-sm pl-2">
                  <div className="flex justify-between">
                    <span>On-Grid Sites ({result.hybridTieredBreakdown.ongrid.mw.toFixed(2)} MW × {formatContractCurrency(result.hybridTieredBreakdown.ongrid.rate)}/MW/yr × {getPeriodMonthsMultiplier(billingFrequency)} months):</span>
                    <span>{formatContractCurrency(result.hybridTieredBreakdown.ongrid.cost)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Hybrid Sites ({result.hybridTieredBreakdown.hybrid.mw.toFixed(2)} MW × {formatContractCurrency(result.hybridTieredBreakdown.hybrid.rate)}/MW/yr × {getPeriodMonthsMultiplier(billingFrequency)} months):</span>
                    <span>{formatContractCurrency(result.hybridTieredBreakdown.hybrid.cost)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Elum ePM breakdown */}
            {result.elumEpmBreakdown && (
              <div className="space-y-3 mb-4">
                <h4 className="font-medium text-sm">Elum ePM Pricing:</h4>
                <div className="space-y-1 text-sm pl-2">
                  <div className="text-muted-foreground mb-2">
                    Site Size Threshold: {result.elumEpmBreakdown.threshold} kWp
                  </div>
                  {result.elumEpmBreakdown.smallSites.length > 0 && (
                    <div className="flex justify-between">
                      <span>
                        Small Sites ≤{result.elumEpmBreakdown.threshold}kWp ({result.elumEpmBreakdown.smallSites.length} sites, {result.elumEpmBreakdown.smallSites.reduce((sum, s) => sum + s.capacityMW, 0).toFixed(2)} MW × {formatContractCurrency(selectedCustomer?.belowThresholdPricePerMWp || 0)}/MWp):
                      </span>
                      <span>{formatContractCurrency(result.elumEpmBreakdown.smallSitesTotal)}</span>
                    </div>
                  )}
                  {result.elumEpmBreakdown.largeSites.length > 0 && (
                    <div className="flex justify-between">
                      <span>
                        Large Sites &gt;{result.elumEpmBreakdown.threshold}kWp ({result.elumEpmBreakdown.largeSites.length} sites, {result.elumEpmBreakdown.largeSites.reduce((sum, s) => sum + s.capacityMW, 0).toFixed(2)} MW × {formatContractCurrency(selectedCustomer?.aboveThresholdPricePerMWp || 0)}/MWp):
                      </span>
                      <span>{formatContractCurrency(result.elumEpmBreakdown.largeSitesTotal)}</span>
                    </div>
                  )}
                  {(result.elumEpmBreakdown.sitesUsingMinimum || 0) > 0 && (
                    <div className="flex justify-between text-orange-600 dark:text-orange-400">
                      <span>Sites using minimum fee ({result.elumEpmBreakdown.sitesUsingMinimum} sites):</span>
                      <span>Minimum applied</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Elum Internal graduated MW breakdown */}
            {result.elumInternalBreakdown && (
              <div className="space-y-3 mb-4">
                <h4 className="font-medium text-sm">Elum Internal Graduated MW Pricing:</h4>
                <div className="space-y-2 text-sm pl-2">
                  {result.elumInternalBreakdown.tiers.map((tier: any, index: number) => (
                    <div key={index} className="flex justify-between">
                      <span>
                        {tier.label} ({tier.mwInTier.toFixed(2)} MW × {formatContractCurrency(tier.pricePerMW)}/MW):
                      </span>
                      <span>{formatContractCurrency(tier.cost)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-medium border-t border-border pt-2">
                    <span>Total ({result.elumInternalBreakdown.totalMW.toFixed(2)} MW):</span>
                    <span>{formatContractCurrency(result.elumInternalBreakdown.totalCost)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Elum Jubaili breakdown */}
            {result.elumJubailiBreakdown && (
              <div className="space-y-3 mb-4">
                <h4 className="font-medium text-sm">Elum Jubaili Pricing:</h4>
                <div className="space-y-2 text-sm pl-2">
                  {result.elumJubailiBreakdown.allTiers && result.elumJubailiBreakdown.allTiers.length > 0 && (
                    <div className="mb-2">
                      <p className="text-muted-foreground mb-1">Per-Site Fee Tiers (based on {result.elumJubailiBreakdown.totalMW?.toFixed(2)} MW):</p>
                      {result.elumJubailiBreakdown.allTiers.map((tier: any, index: number) => {
                        const isApplied = tier === result.elumJubailiBreakdown?.appliedTier;
                        return (
                          <div 
                            key={index} 
                            className={`flex justify-between ${isApplied ? 'font-medium text-primary' : 'text-muted-foreground'}`}
                          >
                            <span>{tier.label || `Tier ${index + 1}`} ({tier.minMW}-{tier.maxMW || '∞'} MW):</span>
                            <span>{formatContractCurrency(tier.chargePerSite)}/site {isApplied && '← Applied'}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex justify-between font-medium border-t border-border pt-2">
                    <span>
                      Site Fees ({result.elumJubailiBreakdown.siteCount} sites × {formatContractCurrency(result.elumJubailiBreakdown.perSiteFee)}/site):
                    </span>
                    <span>{formatContractCurrency(result.elumJubailiBreakdown.totalCost)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Per-site billing breakdown */}
            {result.perSiteBreakdown && (result.perSiteBreakdown.onboardingCost > 0 || result.perSiteBreakdown.annualSubscriptionCost > 0) && (
              <div className="space-y-3 mb-4">
                <h4 className="font-medium text-sm">Per-Site Billing:</h4>
                <div className="space-y-1 text-sm pl-2">
                  {result.perSiteBreakdown.onboardingCost > 0 && (
                    <div className="flex justify-between">
                      <span>Site Onboarding ({result.perSiteBreakdown.sitesOnboarded} sites × {formatContractCurrency(selectedCustomer?.onboardingFeePerSite || 1000)}):</span>
                      <span>{formatContractCurrency(result.perSiteBreakdown.onboardingCost)}</span>
                    </div>
                  )}
                  {result.perSiteBreakdown.annualSubscriptionCost > 0 && (
                    <div className="flex justify-between">
                      <span>Annual Subscription ({result.perSiteBreakdown.sitesRenewed} sites × {formatContractCurrency(selectedCustomer?.annualFeePerSite || 1000)}):</span>
                      <span>{formatContractCurrency(result.perSiteBreakdown.annualSubscriptionCost)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Discounted Assets breakdown */}
            {result.discountedAssets && result.discountedAssets.length > 0 && (
              <div className="space-y-3 mb-4">
                <h4 className="font-medium text-sm text-purple-600 dark:text-purple-400">Discounted Assets:</h4>
                <p className="text-xs text-muted-foreground pl-2">
                  These assets have special discounted rates and are excluded from standard MW-based calculations.
                </p>
                <div className="space-y-1 text-sm pl-2">
                  {result.discountedAssets.map((asset) => (
                    <div key={asset.assetId} className="flex justify-between">
                      <span>
                        {asset.assetName} 
                        <span className="text-muted-foreground">
                          {' '}({asset.mw.toFixed(2)} MW × {asset.pricingType === 'annual' ? 'Fixed' : `${formatContractCurrency(asset.rate)}/MW`})
                        </span>
                        {asset.note && <span className="text-xs text-muted-foreground ml-1">- {asset.note}</span>}
                      </span>
                      <span className="font-medium">{formatContractCurrency(asset.cost)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-medium border-t border-border pt-1 mt-1">
                    <span>Total Discounted Assets:</span>
                    <span>{formatContractCurrency(result.discountedAssetsTotal || 0)}</span>
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
                                {' '}({quantity} sites × {formatContractCurrency(item.pricePerUnit)}/mo × {getPeriodMonthsMultiplier(billingFrequency)} months)
                              </span>
                            )}
                            {quantity > 1 && item.addonId !== 'satelliteDataAPI' && (
                              <span className="text-muted-foreground">
                                {' '}({quantity} × {formatContractCurrency(item.cost / quantity / getFrequencyMultiplier(billingFrequency))})
                              </span>
                            )}:
                          </span>
                          <span className="font-medium">{formatContractCurrency(item.cost)}</span>
                        </div>
                        {/* Show tier details for tiered addons */}
                        {item.tierApplied && (
                          <div className="text-xs text-muted-foreground pl-2">
                            Tier: {item.tierApplied.label} @ {formatContractCurrency(item.pricePerUnit)}/site
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            {/* Only show minimum charges section if NOT using site minimum pricing (since it's included above) */}
            {result.minimumCharges > 0 && !result.siteMinimumPricingBreakdown && (
              <div className="space-y-2 mb-3">
                <div className="flex justify-between text-sm">
                  <span>Minimum Charges:</span>
                  <span>{formatContractCurrency(result.minimumCharges)}</span>
                </div>
              </div>
            )}
            
            {/* Show collapsible site breakdown for site minimum pricing (no duplicate header) */}
            {result.siteMinimumPricingBreakdown && (
              <details className="text-xs bg-muted/30 p-3 rounded-md border mb-3">
                <summary className="cursor-pointer font-medium mb-2">
                  View site-by-site pricing breakdown
                </summary>
                <div className="space-y-3 mt-2">
                    {result.siteMinimumPricingBreakdown.sitesBelowThreshold.length > 0 && (
                    <div>
                      <div className="font-medium mb-1 text-orange-600 dark:text-orange-400">
                        Sites on minimum pricing ({result.siteMinimumPricingBreakdown.sitesBelowThreshold.length}):
                      </div>
                      <div className="space-y-1 pl-2">
                        {result.siteMinimumPricingBreakdown.sitesBelowThreshold.map((site) => (
                          <div key={site.assetId} className="flex justify-between items-center py-1 border-b border-border/30">
                            <div className="flex-1">
                              <div className="font-medium">{site.assetName}</div>
                              <div className="text-muted-foreground">{site.mw.toFixed(2)} MWp</div>
                            </div>
                            <div className="text-right">
                              <div className="line-through text-muted-foreground">{formatContractCurrency(site.calculatedCost)}</div>
                              <div className="font-medium text-orange-600 dark:text-orange-400">{formatContractCurrency(site.minimumCharge)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {result.siteMinimumPricingBreakdown.sitesAboveThreshold.length > 0 && (
                    <div>
                      <div className="font-medium mb-1 text-green-600 dark:text-green-400">
                        Sites on normal pricing ({result.siteMinimumPricingBreakdown.sitesAboveThreshold.length}):
                      </div>
                      <div className="space-y-1 pl-2">
                        {result.siteMinimumPricingBreakdown.sitesAboveThreshold.map((site) => (
                          <div key={site.assetId} className="flex justify-between items-center py-1 border-b border-border/30 last:border-b-0">
                            <div className="flex-1">
                              <div className="font-medium">{site.assetName}</div>
                              <div className="text-muted-foreground">{site.mw.toFixed(2)} MWp</div>
                            </div>
                            <div className="font-medium">{formatContractCurrency(site.calculatedCost)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </details>
            )}
            
            {result.minimumContractAdjustment > 0 && (
              <div className="flex justify-between text-sm text-orange-600 dark:text-orange-400 mb-3">
                <span>Minimum Contract Value Adjustment:</span>
                <span className="font-medium">
                  {formatContractCurrency(result.minimumContractAdjustment)}
                </span>
              </div>
            )}
            
            {result.basePricingCost > 0 && (
              <div className="flex justify-between text-sm mb-3">
                <span>Base Pricing ({getPeriodMonthsMultiplier(billingFrequency)} months × {formatContractCurrency(selectedCustomer.baseMonthlyPrice || 0)}/mo):</span>
                <span>{formatContractCurrency(result.basePricingCost)}</span>
              </div>
            )}
            
            {result.retainerCost > 0 && (
              <div className="flex justify-between text-sm mb-3">
                <span>
                  Retainer Hours
                  {result.retainerMinimumApplied 
                    ? ' (Minimum applied)'
                    : ` (${selectedCustomer.retainerHours || 0} hrs × ${formatContractCurrency(selectedCustomer.retainerHourlyRate || 0)}/hr)`
                  }:
                </span>
                <span>{formatContractCurrency(result.retainerCost)}</span>
              </div>
            )}
            
            <Separator className="my-3" />
            
            <div className="flex justify-between font-medium">
              <span>Total Invoice Amount:</span>
              <span>{formatContractCurrency(result.totalPrice)}</span>
            </div>
            
            {selectedCustomer?.manualInvoicing ? (
              <div className="mt-4 p-3 bg-muted rounded-md border">
                <p className="text-sm text-muted-foreground">
                  ⓘ This contract is set up for manual invoicing. The invoice will be saved to history but not sent to Xero.
                </p>
              </div>
            ) : (
              <Button 
                className="w-full mt-4" 
                onClick={handleSendToXero}
                disabled={isSending || generatingSupportDoc}
              >
                {isSending || generatingSupportDoc ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {generatingSupportDoc ? 'Generating Documents...' : 'Sending...'}
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Send to Xero
                  </>
                )}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default InvoiceCalculator;

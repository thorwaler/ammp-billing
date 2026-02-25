
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContractPackageSelector } from "@/components/contracts/ContractPackageSelector";
import { ContractPdfUploader } from "@/components/contracts/ContractPdfUploader";
import { DiscountTierEditor } from "@/components/contracts/DiscountTierEditor";
import { MinimumChargeTierEditor } from "@/components/contracts/MinimumChargeTierEditor";
import { GraduatedMWTierEditor } from "@/components/contracts/GraduatedMWTierEditor";
import { AssetGroupSelector } from "@/components/contracts/AssetGroupSelector";
import { SelectSeparator } from "@/components/ui/select";
import { 
  MODULES, 
  ADDONS, 
  MODULES_2026,
  ADDONS_2026,
  SPS_ADDONS,
  SPS_DEFAULT_VOLUME_DISCOUNT_TIERS,
  TRIAL_2026,
  MUTUALLY_EXCLUSIVE_2026,
  isPackage2026,
  isSolarAfricaPackage,
  isSpsPackage,
  SOLAR_AFRICA_SETUP_FEE,
  SOLAR_AFRICA_CUSTOMIZATION_HOURLY_RATE,
  SOLAR_AFRICA_MUNICIPALITY_TIERS,
  getSolarAfricaTier,
  type ComplexityLevel, 
  type PricingTier,
  type DiscountTier,
  type MinimumChargeTier,
  type GraduatedMWTier,
  type DeliverableType,
  DEFAULT_PORTFOLIO_DISCOUNT_TIERS,
  DEFAULT_MINIMUM_CHARGE_TIERS,
  DEFAULT_GRADUATED_MW_TIERS
} from "@/data/pricingData";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "@/hooks/use-toast";
import { FileUp, Save, DollarSign, Calendar as CalendarIcon, Loader2, CheckCircle2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/contexts/CurrencyContext";
import { Badge } from "@/components/ui/badge";

// Define the form schema
// Helper to handle optional number fields that may be NaN from empty inputs
const optionalNumber = z.coerce.number().transform(val => isNaN(val) ? undefined : val).optional();

const contractFormSchema = z.object({
  contractName: z.string().optional(),
  companyName: z.string().min(2, { message: "Company name is required" }),
  initialMW: z.coerce.number().min(0, { message: "Initial MW is required" }),
  currency: z.enum(["USD", "EUR"]),
  billingFrequency: z.enum(["monthly", "quarterly", "biannual", "annual"]),
  invoicingType: z.enum(["standard", "manual", "automated"]).optional(),
  nextInvoiceDate: z.string().optional(),
  signedDate: z.string().optional(),
  contractExpiryDate: z.string().optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  package: z.string().min(1, { message: "Package is required" }),
  isTrial: z.boolean().optional(),
  maxMw: z.coerce.number().optional(),
  modules: z.array(z.string()).optional(),
  addons: z.array(z.string()).optional(),
  addonCustomPricing: z.record(z.coerce.number().optional()).optional(),
  addonQuantities: z.record(z.coerce.number().optional()).optional(),
  customPricing: z.object({
    technicalMonitoring: optionalNumber,
    energySavingsHub: optionalNumber,
    stakeholderPortal: optionalNumber,
    control: optionalNumber,
    ongrid_per_mwp: optionalNumber,
    hybrid_per_mwp: optionalNumber,
  }).optional(),
  volumeDiscounts: z.object({
    annualUpfrontDiscount: z.coerce.number().optional(),
    siteSizeThreshold: z.coerce.number().optional(),
    siteSizeDiscount: z.coerce.number().optional(),
    portfolio50MW: z.coerce.number().optional(),
    portfolio100MW: z.coerce.number().optional(),
    portfolio150MW: z.coerce.number().optional(),
    portfolio200MW: z.coerce.number().optional(),
  }).optional(),
  portfolioDiscountTiers: z.array(z.any()).optional(),
  minimumCharge: z.coerce.number().optional(),
  minimumChargeTiers: z.array(z.any()).optional(),
  siteChargeFrequency: z.enum(["monthly", "annual"]).optional(),
  minimumAnnualValue: z.coerce.number().optional(),
  baseMonthlyPrice: z.coerce.number().optional(),
  retainerHours: z.coerce.number().optional(),
  retainerHourlyRate: z.coerce.number().optional(),
  retainerMinimumValue: z.coerce.number().optional(),
  // Per-site package fields
  onboardingFeePerSite: z.coerce.number().optional(),
  annualFeePerSite: z.coerce.number().optional(),
  // Elum package fields
  ammpAssetGroupId: z.string().optional(),
  ammpAssetGroupName: z.string().optional(),
  ammpAssetGroupIdAnd: z.string().optional(),
  ammpAssetGroupNameAnd: z.string().optional(),
  ammpAssetGroupIdNot: z.string().optional(),
  ammpAssetGroupNameNot: z.string().optional(),
  contractAmmpOrgId: z.string().optional(),
  siteSizeThresholdKwp: z.coerce.number().optional(),
  belowThresholdPricePerMWp: z.coerce.number().optional(),
  aboveThresholdPricePerMWp: z.coerce.number().optional(),
  // Elum Internal Assets fields
  graduatedMWTiers: z.array(z.any()).optional(),
  notes: z.string().optional(),
  contractStatus: z.enum(["active", "pending", "expired", "cancelled"]).optional(),
});

type ContractFormValues = z.infer<typeof contractFormSchema>;

interface ContractFormProps {
  existingCustomer?: {
    id: string;
    name: string;
    nickname?: string | null;
    location?: string;
    mwpManaged: number;
    ammpOrgId?: string;
  };
  existingContract?: {
    id: string;
    contractName?: string;
    package: string;
    modules: any[];
    addons: any[];
    initialMW: number;
    billingFrequency: string;
    invoicingType?: string;
    nextInvoiceDate?: string;
    customPricing?: any;
    volumeDiscounts?: any;
    minimumCharge?: number;
    minimumAnnualValue?: number;
    baseMonthlyPrice?: number;
    retainerHours?: number;
    retainerHourlyRate?: number;
    retainerMinimumValue?: number;
    onboardingFeePerSite?: number;
    annualFeePerSite?: number;
    maxMw?: number;
    currency: string;
    signedDate?: string;
    periodStart?: string;
    periodEnd?: string;
    notes?: string;
    contractStatus?: string;
    portfolioDiscountTiers?: any[];
    minimumChargeTiers?: any[];
    siteChargeFrequency?: string;
    contractExpiryDate?: string;
    // Elum package fields
    ammpAssetGroupId?: string;
    ammpAssetGroupName?: string;
    ammpAssetGroupIdAnd?: string;
    ammpAssetGroupNameAnd?: string;
    ammpAssetGroupIdNot?: string;
    ammpAssetGroupNameNot?: string;
    contractAmmpOrgId?: string;
    siteSizeThresholdKwp?: number;
    belowThresholdPricePerMWp?: number;
    aboveThresholdPricePerMWp?: number;
    // Contract-level AMMP fields
    ammpOrgId?: string;
    ammpSyncStatus?: string;
    lastAmmpSync?: string;
    cachedCapabilities?: any;
    // Elum Internal Assets fields
    graduatedMWTiers?: any[];
    // AMMP OS 2026 trial fields
    isTrial?: boolean;
    trialSetupFee?: number;
    vendorApiOnboardingFee?: number;
    // SolarAfrica API fields
    municipalityCount?: number;
    apiSetupFee?: number;
    hourlyRate?: number;
    // SPS Monitoring discount fields
    upfrontDiscountPercent?: number;
    commitmentDiscountPercent?: number;
  };
  onComplete?: () => void;
  onCancel?: () => void;
  isExtending?: boolean;
  isNewContract?: boolean;
}

// Module and addon definitions now imported from shared data file

export function ContractForm({ existingCustomer, existingContract, onComplete, onCancel, isExtending, isNewContract }: ContractFormProps) {
  const [selectedPackage, setSelectedPackage] = useState("");
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [showCustomPricing, setShowCustomPricing] = useState(false);
  const [selectedComplexityItems, setSelectedComplexityItems] = useState<{[key: string]: ComplexityLevel}>({});
  const [addonCustomPrices, setAddonCustomPrices] = useState<{[key: string]: number | undefined}>({});
  const [addonQuantities, setAddonQuantities] = useState<{[key: string]: number | undefined}>({});
  const [addonCustomTiers, setAddonCustomTiers] = useState<Record<string, PricingTier[]>>({});
  const [portfolioDiscountTiers, setPortfolioDiscountTiers] = useState<DiscountTier[]>(DEFAULT_PORTFOLIO_DISCOUNT_TIERS);
  const [minimumChargeTiers, setMinimumChargeTiers] = useState<MinimumChargeTier[]>(DEFAULT_MINIMUM_CHARGE_TIERS);
  const [graduatedMWTiers, setGraduatedMWTiers] = useState<GraduatedMWTier[]>(DEFAULT_GRADUATED_MW_TIERS);
  const [loadingContract, setLoadingContract] = useState(false);
  const [existingContractId, setExistingContractId] = useState<string | null>(null);
  const [uploadedPdfUrl, setUploadedPdfUrl] = useState<string | null>(null);
  const [ocrExtractedFields, setOcrExtractedFields] = useState<Set<string>>(new Set());
  const [isSyncing, setIsSyncing] = useState(false);
  const [isTrial, setIsTrial] = useState(false);
  const [addonDeliverableTypes, setAddonDeliverableTypes] = useState<Record<string, DeliverableType>>({});
  const [municipalityCount, setMunicipalityCount] = useState<number>(0);
  const [apiSetupFee, setApiSetupFee] = useState<number>(SOLAR_AFRICA_SETUP_FEE);
  const [hourlyRate, setHourlyRate] = useState<number>(SOLAR_AFRICA_CUSTOMIZATION_HOURLY_RATE);
  const [selectedContractTypeId, setSelectedContractTypeId] = useState<string | null>(null);
  const [upfrontDiscountPercent, setUpfrontDiscountPercent] = useState<number>(0);
  const [commitmentDiscountPercent, setCommitmentDiscountPercent] = useState<number>(0);
  const { currency: userCurrency} = useCurrency();

  // Fetch custom contract types
  const { data: customContractTypes = [] } = useQuery({
    queryKey: ["contract_types_active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_types" as any)
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const form = useForm<ContractFormValues>({
    resolver: zodResolver(contractFormSchema),
    defaultValues: existingContract ? {
      contractName: (existingContract as any).contractName || "",
      companyName: existingCustomer?.name || "",
      initialMW: existingContract.initialMW,
      currency: existingContract.currency as "USD" | "EUR",
      billingFrequency: (existingContract.package === 'per_site' ? 'monthly' : existingContract.billingFrequency) as any,
      invoicingType: (existingContract.invoicingType as "standard" | "manual" | "automated") || "standard",
      nextInvoiceDate: existingContract.nextInvoiceDate?.substring(0, 10) || "",
      package: existingContract.package as any,
      maxMw: existingContract.maxMw,
      modules: existingContract.modules || [],
      addons: (existingContract.addons || []).map((a: any) => typeof a === 'string' ? a : a.id),
      customPricing: existingContract.customPricing,
      volumeDiscounts: existingContract.volumeDiscounts,
      minimumCharge: existingContract.minimumCharge,
      minimumAnnualValue: existingContract.minimumAnnualValue,
      baseMonthlyPrice: existingContract.baseMonthlyPrice,
      siteChargeFrequency: (existingContract.siteChargeFrequency as any) || "annual",
      notes: existingContract.notes,
      signedDate: existingContract.signedDate?.substring(0, 10) || "",
      contractExpiryDate: existingContract.contractExpiryDate?.substring(0, 10) || "",
      periodStart: existingContract.periodStart?.substring(0, 10) || "",
      periodEnd: existingContract.periodEnd?.substring(0, 10) || "",
      contractStatus: existingContract.contractStatus as any,
      // Elum asset group fields
      ammpAssetGroupId: existingContract.ammpAssetGroupId || "",
      ammpAssetGroupName: existingContract.ammpAssetGroupName || "",
      ammpAssetGroupIdAnd: existingContract.ammpAssetGroupIdAnd || "",
      ammpAssetGroupNameAnd: existingContract.ammpAssetGroupNameAnd || "",
      ammpAssetGroupIdNot: existingContract.ammpAssetGroupIdNot || "",
      ammpAssetGroupNameNot: existingContract.ammpAssetGroupNameNot || "",
      contractAmmpOrgId: existingContract.ammpOrgId || existingContract.contractAmmpOrgId || "",
      siteSizeThresholdKwp: existingContract.siteSizeThresholdKwp,
      belowThresholdPricePerMWp: existingContract.belowThresholdPricePerMWp,
      aboveThresholdPricePerMWp: existingContract.aboveThresholdPricePerMWp,
    } : {
      contractName: "",
      companyName: existingCustomer?.name || "",
      initialMW: existingCustomer?.mwpManaged || 0,
      currency: userCurrency || "EUR",
      billingFrequency: "annual",
      invoicingType: "standard" as const,
      nextInvoiceDate: "",
      signedDate: "",
      contractExpiryDate: "",
      periodStart: "",
      periodEnd: "",
      package: "pro" as const,
      modules: ["technicalMonitoring"],
      addons: [],
      customPricing: {
        technicalMonitoring: undefined,
        energySavingsHub: undefined,
        stakeholderPortal: undefined,
        control: undefined,
      },
      volumeDiscounts: {
        annualUpfrontDiscount: 5,
        siteSizeThreshold: 3,
        siteSizeDiscount: 0,
        portfolio50MW: 5,
        portfolio100MW: 10,
        portfolio150MW: 15,
        portfolio200MW: 20,
      },
      portfolioDiscountTiers: DEFAULT_PORTFOLIO_DISCOUNT_TIERS,
      minimumCharge: 0,
      minimumChargeTiers: DEFAULT_MINIMUM_CHARGE_TIERS,
      siteChargeFrequency: "annual",
      minimumAnnualValue: 0,
      notes: "",
    },
  });

  // Initialize state from existingContract prop
  useEffect(() => {
    if (existingContract) {
      setSelectedPackage(existingContract.package);
      setSelectedModules(existingContract.modules || []);
      
      // Initialize trial state from existing contract
      if (existingContract.isTrial !== undefined) {
        setIsTrial(existingContract.isTrial);
        form.setValue('isTrial', existingContract.isTrial);
      }
      
      // Initialize SolarAfrica API state from existing contract
      if (existingContract.municipalityCount !== undefined) {
        setMunicipalityCount(existingContract.municipalityCount);
      }
      if (existingContract.apiSetupFee !== undefined) {
        setApiSetupFee(existingContract.apiSetupFee);
      }
      if (existingContract.hourlyRate !== undefined) {
        setHourlyRate(existingContract.hourlyRate);
      }
      
      // Initialize SPS Monitoring discount state
      if (existingContract.upfrontDiscountPercent !== undefined) {
        setUpfrontDiscountPercent(existingContract.upfrontDiscountPercent);
      }
      if (existingContract.commitmentDiscountPercent !== undefined) {
        setCommitmentDiscountPercent(existingContract.commitmentDiscountPercent);
      }
      
      // Initialize portfolio discount tiers
      if ((existingContract as any).portfolioDiscountTiers) {
        setPortfolioDiscountTiers((existingContract as any).portfolioDiscountTiers);
      } else if (existingContract.volumeDiscounts) {
        // Migrate old volume discounts to tier format if needed
        const oldDiscounts = existingContract.volumeDiscounts as any;
        setPortfolioDiscountTiers([
          { minMW: 0, maxMW: 49.99, discountPercent: 0, label: "0-49 MW" },
          { minMW: 50, maxMW: 99.99, discountPercent: oldDiscounts.portfolio50MW || 5, label: "50-99 MW" },
          { minMW: 100, maxMW: 149.99, discountPercent: oldDiscounts.portfolio100MW || 10, label: "100-149 MW" },
          { minMW: 150, maxMW: 199.99, discountPercent: oldDiscounts.portfolio150MW || 15, label: "150-199 MW" },
          { minMW: 200, maxMW: null, discountPercent: oldDiscounts.portfolio200MW || 20, label: "200+ MW" }
        ]);
      }
      
      // Initialize minimum charge tiers
      if ((existingContract as any).minimumChargeTiers) {
        setMinimumChargeTiers((existingContract as any).minimumChargeTiers);
      } else if (existingContract.minimumCharge) {
        // Migrate old minimum charge to tier format if needed
        const charge = existingContract.minimumCharge;
        setMinimumChargeTiers([
          { minMW: 0, maxMW: 49.99, chargePerSite: charge, label: "0-49 MW" },
          { minMW: 50, maxMW: 99.99, chargePerSite: charge, label: "50-99 MW" },
          { minMW: 100, maxMW: 149.99, chargePerSite: charge, label: "100-149 MW" },
          { minMW: 150, maxMW: 199.99, chargePerSite: charge, label: "150-199 MW" },
          { minMW: 200, maxMW: null, chargePerSite: charge, label: "200+ MW" }
        ]);
      }
      
      // Initialize addon states
      const addons = existingContract.addons || [];
      const complexities: {[key: string]: ComplexityLevel} = {};
      const customPrices: {[key: string]: number | undefined} = {};
      const quantities: {[key: string]: number | undefined} = {};
      const customTiers: Record<string, PricingTier[]> = {};
      
      addons.forEach((addon: any) => {
        const addonId = typeof addon === 'string' ? addon : addon.id;
        if (typeof addon === 'object') {
          if (addon.complexity) complexities[addonId] = addon.complexity;
          if (addon.customPrice) customPrices[addonId] = addon.customPrice;
          if (addon.quantity) quantities[addonId] = addon.quantity;
          if (addon.customTiers) customTiers[addonId] = addon.customTiers;
        }
      });
      
      setSelectedComplexityItems(complexities);
      setAddonCustomPrices(customPrices);
      setAddonQuantities(quantities);
      setAddonCustomTiers(customTiers);
      
      // Set custom pricing visibility if custom pricing exists
      if (existingContract.customPricing && Object.keys(existingContract.customPricing).length > 0) {
        setShowCustomPricing(true);
      }
      
      // Initialize Elum asset group fields
      form.setValue('ammpAssetGroupId', existingContract.ammpAssetGroupId || '');
      form.setValue('ammpAssetGroupName', existingContract.ammpAssetGroupName || '');
      form.setValue('ammpAssetGroupIdAnd', existingContract.ammpAssetGroupIdAnd || '');
      form.setValue('ammpAssetGroupNameAnd', existingContract.ammpAssetGroupNameAnd || '');
      form.setValue('ammpAssetGroupIdNot', existingContract.ammpAssetGroupIdNot || '');
      form.setValue('ammpAssetGroupNameNot', existingContract.ammpAssetGroupNameNot || '');
      form.setValue('contractAmmpOrgId', existingContract.ammpOrgId || existingContract.contractAmmpOrgId || '');
      form.setValue('siteSizeThresholdKwp', existingContract.siteSizeThresholdKwp ?? undefined);
      form.setValue('belowThresholdPricePerMWp', existingContract.belowThresholdPricePerMWp ?? undefined);
      form.setValue('aboveThresholdPricePerMWp', existingContract.aboveThresholdPricePerMWp ?? undefined);
      form.setValue('onboardingFeePerSite', existingContract.onboardingFeePerSite ?? undefined);
      form.setValue('annualFeePerSite', existingContract.annualFeePerSite ?? undefined);
      form.setValue('nextInvoiceDate', existingContract.nextInvoiceDate?.substring(0, 10) || '');
      
      // Store contract ID for update if not extending
      if (!isExtending) {
        setExistingContractId(existingContract.id);
      }
    }
  }, [existingContract, isExtending, form]);

  // Auto-extend period dates when extending a contract
  useEffect(() => {
    if (isExtending && existingContract?.periodEnd) {
      const currentEnd = new Date(existingContract.periodEnd);
      const newStart = new Date(currentEnd);
      newStart.setDate(newStart.getDate() + 1);
      
      const newEnd = new Date(newStart);
      newEnd.setFullYear(newEnd.getFullYear() + 1); // Extend by 1 year
      
      form.setValue('periodStart', newStart.toISOString().split('T')[0]);
      form.setValue('periodEnd', newEnd.toISOString().split('T')[0]);
    }
  }, [isExtending, existingContract?.periodEnd]);

  // Load existing contract data if editing (only when no existingContract prop is provided)
  useEffect(() => {
    if (existingContract || isNewContract) return; // Skip if we already have contract data from props OR if explicitly creating a new contract
    
    const loadExistingContract = async () => {
      if (!existingCustomer?.id) return;
      
      setLoadingContract(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Load active contract by customer_id
        const { data: contract, error } = await supabase
          .from('contracts')
          .select('*')
          .eq('customer_id', existingCustomer.id)
          .eq('user_id', user.id)
          .eq('contract_status', 'active')
          .maybeSingle();

        if (error) throw error;
        if (!contract) return;  // No existing contract, that's fine
        
        // Store contract ID for update
        setExistingContractId(contract.id);

        // Populate all form fields
        form.setValue('contractName', (contract as any).contract_name || '');
        form.setValue('companyName', contract.company_name);
        form.setValue('initialMW', contract.initial_mw);
        form.setValue('currency', contract.currency as "USD" | "EUR");
        form.setValue('billingFrequency', (contract.package === 'per_site' ? 'monthly' : contract.billing_frequency) as "monthly" | "quarterly" | "biannual" | "annual");
        form.setValue('nextInvoiceDate', contract.next_invoice_date ? contract.next_invoice_date.substring(0, 10) : '');
        form.setValue('signedDate', (contract as any).signed_date ? (contract as any).signed_date.substring(0, 10) : '');
        form.setValue('contractExpiryDate', (contract as any).contract_expiry_date ? (contract as any).contract_expiry_date.substring(0, 10) : '');
        form.setValue('periodStart', (contract as any).period_start ? (contract as any).period_start.substring(0, 10) : '');
        form.setValue('periodEnd', (contract as any).period_end ? (contract as any).period_end.substring(0, 10) : '');
        form.setValue('package', contract.package as "starter" | "pro" | "custom");
        form.setValue('modules', (contract.modules || []) as string[]);
        form.setValue('customPricing', (contract.custom_pricing || {}) as any);
        form.setValue('volumeDiscounts', (contract.volume_discounts || {
          annualUpfrontDiscount: 5,
          siteSizeThreshold: 3,
          siteSizeDiscount: 0,
          portfolio50MW: 5,
          portfolio100MW: 10,
          portfolio150MW: 15,
          portfolio200MW: 20,
        }) as any);
        form.setValue('minimumCharge', contract.minimum_charge || 0);
        form.setValue('minimumAnnualValue', contract.minimum_annual_value || 0);
        form.setValue('maxMw', contract.max_mw || undefined);
        form.setValue('notes', contract.notes || '');
        form.setValue('contractStatus', (contract.contract_status || 'active') as "active" | "pending" | "expired" | "cancelled");

        // Set component state
        setSelectedPackage(contract.package);
        setSelectedModules((contract.modules || []) as string[]);
        setShowCustomPricing(contract.package === 'custom');

        // Handle addons with complexity
        const addonIds = ((contract.addons || []) as any[]).map((a: any) => a.id || a);
        form.setValue('addons', addonIds);

        // Restore complexity selections, custom prices, quantities, and custom tiers
        const complexityMap: {[key: string]: ComplexityLevel} = {};
        const customPriceMap: {[key: string]: number} = {};
        const quantityMap: {[key: string]: number} = {};
        const customTiersMap: Record<string, PricingTier[]> = {};
        
        ((contract.addons || []) as any[]).forEach((addon: any) => {
          if (addon.complexity) {
            complexityMap[addon.id] = addon.complexity as ComplexityLevel;
          }
          if (addon.customPrice !== undefined) {
            customPriceMap[addon.id] = addon.customPrice;
          }
          if (addon.quantity !== undefined) {
            quantityMap[addon.id] = addon.quantity;
          }
          if (addon.customTiers) {
            customTiersMap[addon.id] = addon.customTiers;
          }
        });
        
        setSelectedComplexityItems(complexityMap);
        setAddonCustomPrices(customPriceMap);
        setAddonQuantities(quantityMap);
        setAddonCustomTiers(customTiersMap);
        
        // Load portfolio discount tiers
        if ((contract as any).portfolio_discount_tiers && Array.isArray((contract as any).portfolio_discount_tiers)) {
          setPortfolioDiscountTiers((contract as any).portfolio_discount_tiers);
        } else if (contract.volume_discounts) {
          // Migrate old volume discounts to tier format
          const oldDiscounts = contract.volume_discounts as any;
          setPortfolioDiscountTiers([
            { minMW: 0, maxMW: 49.99, discountPercent: 0, label: "0-49 MW" },
            { minMW: 50, maxMW: 99.99, discountPercent: oldDiscounts.portfolio50MW || 5, label: "50-99 MW" },
            { minMW: 100, maxMW: 149.99, discountPercent: oldDiscounts.portfolio100MW || 10, label: "100-149 MW" },
            { minMW: 150, maxMW: 199.99, discountPercent: oldDiscounts.portfolio150MW || 15, label: "150-199 MW" },
            { minMW: 200, maxMW: null, discountPercent: oldDiscounts.portfolio200MW || 20, label: "200+ MW" }
          ]);
        }
        
        // Load minimum charge tiers
        if ((contract as any).minimum_charge_tiers && Array.isArray((contract as any).minimum_charge_tiers)) {
          setMinimumChargeTiers((contract as any).minimum_charge_tiers);
        } else if (contract.minimum_charge) {
          // Migrate old minimum charge to tier format
          const charge = contract.minimum_charge;
          setMinimumChargeTiers([
            { minMW: 0, maxMW: 49.99, chargePerSite: charge, label: "0-49 MW" },
            { minMW: 50, maxMW: 99.99, chargePerSite: charge, label: "50-99 MW" },
            { minMW: 100, maxMW: 149.99, chargePerSite: charge, label: "100-149 MW" },
            { minMW: 150, maxMW: 199.99, chargePerSite: charge, label: "150-199 MW" },
            { minMW: 200, maxMW: null, chargePerSite: charge, label: "200+ MW" }
          ]);
        }

        // Load Elum asset group fields
        form.setValue('ammpAssetGroupId', contract.ammp_asset_group_id || '');
        form.setValue('ammpAssetGroupName', contract.ammp_asset_group_name || '');
        form.setValue('ammpAssetGroupIdAnd', contract.ammp_asset_group_id_and || '');
        form.setValue('ammpAssetGroupNameAnd', contract.ammp_asset_group_name_and || '');
        form.setValue('ammpAssetGroupIdNot', contract.ammp_asset_group_id_not || '');
        form.setValue('ammpAssetGroupNameNot', contract.ammp_asset_group_name_not || '');
        form.setValue('contractAmmpOrgId', contract.ammp_org_id || '');
        form.setValue('siteSizeThresholdKwp', contract.site_size_threshold_kwp || undefined);
        form.setValue('belowThresholdPricePerMWp', contract.below_threshold_price_per_mwp || undefined);
        form.setValue('aboveThresholdPricePerMWp', contract.above_threshold_price_per_mwp || undefined);

      } catch (error) {
        console.error('Error loading contract:', error);
        toast({
          title: "Error loading contract",
          description: error instanceof Error ? error.message : "Please try again.",
          variant: "destructive",
        });
      } finally {
        setLoadingContract(false);
      }
    };

    loadExistingContract();
  }, [existingCustomer]);


  // Auto-activate Solcast addon based on customer capabilities
  useEffect(() => {
    const checkSolcastAutoActivation = async () => {
      if (!existingCustomer?.id) return;
      
      try {
        const { data: customerData } = await supabase
          .from('customers')
          .select('ammp_capabilities')
          .eq('id', existingCustomer.id)
          .single();
        
        if (customerData?.ammp_capabilities) {
          const capabilities = customerData.ammp_capabilities as any;
          if (capabilities.sitesWithSolcast && capabilities.sitesWithSolcast > 0) {
            const solcastCount = capabilities.sitesWithSolcast;
            
            // Auto-activate addon if not already selected
            const currentAddons = form.getValues('addons') || [];
            if (!currentAddons.includes('satelliteDataAPI')) {
              form.setValue('addons', [...currentAddons, 'satelliteDataAPI']);
            }
            
            // Set quantity
            setAddonQuantities(prev => ({
              ...prev,
              satelliteDataAPI: solcastCount
            }));
            
            console.log(`Auto-activated Solcast addon with ${solcastCount} sites for customer ${existingCustomer.id}`);
          }
        }
      } catch (error) {
        console.error('Error checking Solcast auto-activation:', error);
      }
    };

    checkSolcastAutoActivation();
  }, [existingCustomer?.id]);

  const watchPackage = form.watch("package");
  const watchModules = form.watch("modules");
  const watchAddons = form.watch("addons");

  // Handle package change
  const handlePackageChange = (value: string) => {
    setSelectedPackage(value);
    
    if (value === "starter") {
      // Starter package only includes Technical Monitoring
      form.setValue("modules", ["technicalMonitoring"]);
      form.setValue("minimumAnnualValue", 3000);
    } else if (value === "pro") {
      form.setValue("minimumAnnualValue", 5000);
      setShowCustomPricing(false);
    } else if (value === "custom") {
      setShowCustomPricing(true);
    } else if (value === "hybrid_tiered" || value === "hybrid_tiered_assetgroups") {
      // Remove technical monitoring from hybrid_tiered packages
      const currentModules = form.getValues("modules") || [];
      const filteredModules = currentModules.filter(id => id !== "technicalMonitoring");
      form.setValue("modules", filteredModules);
      setShowCustomPricing(false);
    } else if (value === "per_site") {
      // Per-site package - set defaults
      form.setValue("onboardingFeePerSite", 1000);
      form.setValue("annualFeePerSite", 1000);
      form.setValue("billingFrequency", "monthly"); // Per-site contracts are checked monthly
      form.setValue("modules", []);
      setShowCustomPricing(false);
    } else if (value === "elum_epm") {
      // Elum ePM - site-size threshold pricing
      form.setValue("siteSizeThresholdKwp", 100);
      form.setValue("belowThresholdPricePerMWp", 50);
      form.setValue("aboveThresholdPricePerMWp", 30);
      form.setValue("modules", []);
      setShowCustomPricing(false);
    } else if (value === "elum_jubaili") {
      // Elum Jubaili - per-site pricing
      form.setValue("annualFeePerSite", 500);
      form.setValue("modules", []);
      setShowCustomPricing(false);
    } else if (value === "elum_portfolio_os") {
      // Elum Portfolio OS - full pricing flexibility
      form.setValue("modules", ["technicalMonitoring"]);
      setShowCustomPricing(true);
    } else if (value === "elum_internal") {
      // Elum Internal Assets - graduated MW pricing
      form.setValue("modules", []);
      setShowCustomPricing(false);
    } else if (value === "ammp_os_2026") {
      // AMMP OS 2026 - new pricing structure
      form.setValue("modules", []);
      form.setValue("minimumAnnualValue", 5000);
      form.setValue("isTrial", false);
      setIsTrial(false);
      setShowCustomPricing(true);
    } else if (value === "sps_monitoring") {
      // SPS Monitoring - module-based with 3 stacking discounts
      form.setValue("modules", ["technicalMonitoring"]);
      form.setValue("minimumAnnualValue", 100000);
      form.setValue("billingFrequency", "quarterly");
      setPortfolioDiscountTiers(SPS_DEFAULT_VOLUME_DISCOUNT_TIERS);
      setUpfrontDiscountPercent(existingContract?.upfrontDiscountPercent ?? 5);
      setCommitmentDiscountPercent(existingContract?.commitmentDiscountPercent ?? 3);
      setShowCustomPricing(true);
    } else if (value === "solar_africa_api") {
      // SolarAfrica API - municipality-based pricing
      form.setValue("modules", []);
      form.setValue("initialMW", 0);
      setMunicipalityCount(existingContract?.municipalityCount || 0);
      setApiSetupFee(existingContract?.apiSetupFee || SOLAR_AFRICA_SETUP_FEE);
      setHourlyRate(existingContract?.hourlyRate || SOLAR_AFRICA_CUSTOMIZATION_HOURLY_RATE);
      setShowCustomPricing(false);
    } else {
      // Check if this is a custom contract type
      const customType = customContractTypes.find((ct: any) => ct.slug === value);
      if (customType) {
        setSelectedContractTypeId(customType.id);
        // Apply template defaults
        if (customType.default_currency) {
          form.setValue("currency", customType.default_currency as any);
        }
        if (customType.default_billing_frequency) {
          form.setValue("billingFrequency", customType.default_billing_frequency as any);
        }
        if (customType.default_minimum_annual_value) {
          form.setValue("minimumAnnualValue", customType.default_minimum_annual_value);
        }
        // Load modules from template
        const modulesConfig = customType.modules_config as any[] || [];
        const moduleIds = modulesConfig.filter((m: any) => m.available).map((m: any) => m.id);
        form.setValue("modules", moduleIds);
        
        // Set custom pricing visibility based on pricing model
        const needsCustomPricing = ['per_mw_modules'].includes(customType.pricing_model);
        setShowCustomPricing(needsCustomPricing);
      } else {
        setSelectedContractTypeId(null);
        setShowCustomPricing(false);
      }
    }
  };

  // Handle OCR completion
  const handleOcrComplete = (extractedData: any, pdfUrl: string) => {
    setUploadedPdfUrl(pdfUrl);
    const extractedFieldNames = new Set<string>();

    // Auto-populate form fields with extracted data
    if (extractedData.companyName) {
      form.setValue("companyName", extractedData.companyName);
      extractedFieldNames.add("companyName");
    }
    if (extractedData.initialMW) {
      form.setValue("initialMW", extractedData.initialMW);
      extractedFieldNames.add("initialMW");
    }
    if (extractedData.currency) {
      form.setValue("currency", extractedData.currency);
      extractedFieldNames.add("currency");
    }
    if (extractedData.billingFrequency) {
      form.setValue("billingFrequency", extractedData.billingFrequency);
      extractedFieldNames.add("billingFrequency");
    }
    if (extractedData.signedDate) {
      form.setValue("signedDate", extractedData.signedDate);
      extractedFieldNames.add("signedDate");
    }
    if (extractedData.periodStart) {
      form.setValue("periodStart", extractedData.periodStart);
      extractedFieldNames.add("periodStart");
    }
    if (extractedData.periodEnd) {
      form.setValue("periodEnd", extractedData.periodEnd);
      extractedFieldNames.add("periodEnd");
    }
    if (extractedData.nextInvoiceDate) {
      form.setValue("nextInvoiceDate", extractedData.nextInvoiceDate);
      extractedFieldNames.add("nextInvoiceDate");
    }
    if (extractedData.packageType) {
      handlePackageChange(extractedData.packageType);
      extractedFieldNames.add("package");
    }
    if (extractedData.modules && Array.isArray(extractedData.modules)) {
      form.setValue("modules", extractedData.modules);
      setSelectedModules(extractedData.modules);
      extractedFieldNames.add("modules");
    }
    if (extractedData.addons && Array.isArray(extractedData.addons)) {
      form.setValue("addons", extractedData.addons);
      extractedFieldNames.add("addons");
    }
    if (extractedData.minimumCharge) {
      form.setValue("minimumCharge", extractedData.minimumCharge);
      extractedFieldNames.add("minimumCharge");
    }
    if (extractedData.minimumAnnualValue) {
      form.setValue("minimumAnnualValue", extractedData.minimumAnnualValue);
      extractedFieldNames.add("minimumAnnualValue");
    }
    if (extractedData.notes) {
      form.setValue("notes", extractedData.notes);
      extractedFieldNames.add("notes");
    }
    if (extractedData.customPricing) {
      form.setValue("customPricing", extractedData.customPricing);
      setShowCustomPricing(true);
      extractedFieldNames.add("customPricing");
    }
    if (extractedData.volumeDiscounts) {
      form.setValue("volumeDiscounts", extractedData.volumeDiscounts);
      extractedFieldNames.add("volumeDiscounts");
    }

    setOcrExtractedFields(extractedFieldNames);
  };

  // Handle module selection
  const handleModuleSelection = (moduleId: string, checked: boolean) => {
    const currentModules = form.getValues("modules") || [];
    const currentPackage = form.getValues("package");
    const isHybridTiered = currentPackage === "hybrid_tiered" || currentPackage === "hybrid_tiered_assetgroups";
    
    // Block technicalMonitoring for hybrid tiered packages
    if (checked && moduleId === "technicalMonitoring" && isHybridTiered) {
      toast({
        title: "Technical Monitoring included",
        description: "Technical Monitoring is included in the hybrid tiered base rate and cannot be selected separately.",
      });
      return;
    }
    
    // Mutual exclusivity for 2026 package
    if (checked && isPackage2026(currentPackage)) {
      for (const [a, b] of MUTUALLY_EXCLUSIVE_2026) {
        if (moduleId === a && currentModules.includes(b)) {
          form.setValue("modules", [...currentModules.filter(id => id !== b), moduleId]);
          return;
        }
        if (moduleId === b && currentModules.includes(a)) {
          form.setValue("modules", [...currentModules.filter(id => id !== a), moduleId]);
          return;
        }
      }
    }
    
    if (checked) {
      form.setValue("modules", [...currentModules, moduleId]);
    } else {
      form.setValue(
        "modules",
        currentModules.filter((id) => id !== moduleId)
      );
    }
  };

  // Handle addon selection
  const handleAddonSelection = (addonId: string, checked: boolean) => {
    const currentAddons = form.getValues("addons") || [];
    
    if (checked) {
      form.setValue("addons", [...currentAddons, addonId]);
      
      // If the addon has complexity pricing, open a dialog or show fields to select complexity
      const currentPackage = form.getValues("package");
      const addonList = isPackage2026(currentPackage) ? ADDONS_2026 : ADDONS;
      const addon = addonList.find(a => a.id === addonId);
      if (addon?.complexityPricing) {
        setSelectedComplexityItems({
          ...selectedComplexityItems,
          [addonId]: "low" // Default to low complexity
        });
      }
    } else {
      form.setValue(
        "addons",
        currentAddons.filter((id) => id !== addonId)
      );
      
      // Clear complexity selection
      if (selectedComplexityItems[addonId]) {
        const newComplexityItems = {...selectedComplexityItems};
        delete newComplexityItems[addonId];
        setSelectedComplexityItems(newComplexityItems);
      }
      
      // Clear custom price
      if (addonCustomPrices[addonId]) {
        const newPrices = {...addonCustomPrices};
        delete newPrices[addonId];
        setAddonCustomPrices(newPrices);
      }
      
      // Clear quantity
      if (addonQuantities[addonId]) {
        const newQuantities = {...addonQuantities};
        delete newQuantities[addonId];
        setAddonQuantities(newQuantities);
      }
    }
  };

  // Handle complexity selection for addons
  const handleComplexityChange = (addonId: string, complexity: ComplexityLevel) => {
    setSelectedComplexityItems({
      ...selectedComplexityItems,
      [addonId]: complexity
    });
  };

  const onSubmit = async (data: ContractFormValues) => {
    console.log('🚀 Form submission triggered!', data);
    console.log('Form state:', form.formState);
    
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Authentication required",
          description: "Please log in to create contracts.",
          variant: "destructive",
        });
        return;
      }

      // 1. Upsert customer
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .upsert({
          ...(existingCustomer?.id && { id: existingCustomer.id }),
          name: data.companyName,
          mwp_managed: data.initialMW,
          status: 'active',
          user_id: user.id
        })
        .select()
        .single();

      if (customerError) throw customerError;

      // 2. Prepare addons with complexity, custom pricing, quantity, and custom tiers
      const addonList = isPackage2026(data.package) ? ADDONS_2026 : ADDONS;
      const enhancedAddons = (data.addons || []).map(addonId => {
        const addon = addonList.find(a => a.id === addonId);
        return {
          id: addonId,
          complexity: addon?.complexityPricing ? selectedComplexityItems[addonId] || 'low' : undefined,
          customPrice: addonCustomPrices[addonId],
          quantity: addonQuantities[addonId] || 1,
          customTiers: addonCustomTiers[addonId],
          ...(addonId === 'customDashboardReportAlerts' && addonDeliverableTypes[addonId] 
            ? { deliverableType: addonDeliverableTypes[addonId] } 
            : {}),
        };
      });

      // 3. Upsert contract (update if exists, create if not)
      const contractData: any = {
        customer_id: customer.id,
        company_name: data.companyName,
        contract_name: data.contractName || null,
        package: data.package,
        initial_mw: data.initialMW,
        currency: data.currency,
        billing_frequency: data.package === 'per_site' ? 'monthly' : data.billingFrequency,
        invoicing_type: data.invoicingType || 'standard',
        // POC contracts don't have invoicing
        next_invoice_date: data.package === 'poc' ? null : (data.nextInvoiceDate || null),
        signed_date: data.signedDate || null,
        contract_expiry_date: data.contractExpiryDate || null,
        period_start: data.periodStart || null,
        period_end: data.periodEnd || null,
        modules: (data.package === 'poc' || data.package === 'per_site') ? [] : (data.modules || []),
        addons: (data.package === 'poc' || data.package === 'per_site') ? [] : enhancedAddons,
        custom_pricing: (data.package === 'poc' || data.package === 'per_site') ? {} : (data.customPricing || {}),
        volume_discounts: (data.package === 'poc' || data.package === 'per_site') ? {} : (data.volumeDiscounts || {}),
        portfolio_discount_tiers: (data.package === 'poc' || data.package === 'per_site') ? [] : portfolioDiscountTiers,
        minimum_charge: (data.package === 'poc' || data.package === 'per_site') ? 0 : (data.minimumCharge || 0),
        minimum_charge_tiers: (data.package === 'poc' || data.package === 'per_site') ? [] : minimumChargeTiers,
        site_charge_frequency: data.siteChargeFrequency || "annual",
        minimum_annual_value: (data.package === 'poc' || data.package === 'per_site') ? 0 : (data.minimumAnnualValue || 0),
        base_monthly_price: (data.package === 'poc' || data.package === 'per_site') ? 0 : (data.baseMonthlyPrice || 0),
        retainer_hours: (data.package === 'poc' || data.package === 'per_site') ? null : (data.retainerHours || null),
        retainer_hourly_rate: (data.package === 'poc' || data.package === 'per_site') ? null : (data.retainerHourlyRate || null),
        retainer_minimum_value: (data.package === 'poc' || data.package === 'per_site') ? null : (data.retainerMinimumValue || null),
        // Per-site package fields
        onboarding_fee_per_site: (data.package === 'per_site' || data.package === 'elum_jubaili') 
          ? (data.onboardingFeePerSite || (data.package === 'per_site' ? 1000 : null)) 
          : null,
        annual_fee_per_site: (data.package === 'per_site' || data.package === 'elum_jubaili') 
          ? (data.annualFeePerSite || (data.package === 'per_site' ? 1000 : 500)) 
          : null,
        // Asset group fields - always save regardless of package
        ammp_asset_group_id: data.ammpAssetGroupId || null,
        ammp_asset_group_name: data.ammpAssetGroupName || null,
        ammp_asset_group_id_and: data.ammpAssetGroupIdAnd || null,
        ammp_asset_group_name_and: data.ammpAssetGroupNameAnd || null,
        ammp_asset_group_id_not: data.ammpAssetGroupIdNot || null,
        ammp_asset_group_name_not: data.ammpAssetGroupNameNot || null,
        ammp_org_id: data.package !== 'poc' 
          ? (data.contractAmmpOrgId || null) 
          : null,
        site_size_threshold_kwp: data.package === 'elum_epm' 
          ? (data.siteSizeThresholdKwp || 100) 
          : null,
        below_threshold_price_per_mwp: data.package === 'elum_epm' 
          ? (data.belowThresholdPricePerMWp || 50) 
          : null,
        above_threshold_price_per_mwp: data.package === 'elum_epm' 
          ? (data.aboveThresholdPricePerMWp || 30) 
          : null,
        // Elum Internal Assets graduated MW tiers
        graduated_mw_tiers: data.package === 'elum_internal' 
          ? graduatedMWTiers 
          : [],
        max_mw: data.maxMw || null,
        notes: data.notes || '',
        contract_status: 'active',
        user_id: user.id,
        contract_pdf_url: uploadedPdfUrl || null,
        // AMMP OS 2026 trial fields
        is_trial: data.package === 'ammp_os_2026' ? isTrial : false,
        trial_setup_fee: (data.package === 'ammp_os_2026' && isTrial) ? TRIAL_2026.setupFee : null,
        vendor_api_onboarding_fee: (data.package === 'ammp_os_2026' && isTrial) ? TRIAL_2026.vendorApiOnboardingFee : null,
        // SolarAfrica API fields
        municipality_count: data.package === 'solar_africa_api' ? municipalityCount : null,
        api_setup_fee: data.package === 'solar_africa_api' ? apiSetupFee : null,
        hourly_rate: data.package === 'solar_africa_api' ? hourlyRate : null,
        // Custom contract type reference
        contract_type_id: selectedContractTypeId || null,
        // SPS Monitoring discount fields
        upfront_discount_percent: data.package === 'sps_monitoring' ? upfrontDiscountPercent : null,
        commitment_discount_percent: data.package === 'sps_monitoring' ? commitmentDiscountPercent : null,
      };

      if (existingContractId) {
        contractData.id = existingContractId;
      }

      const { error: contractError } = await supabase
        .from('contracts')
        .upsert(contractData);

      if (contractError) throw contractError;

      toast({
        title: existingContractId ? "Contract updated" : "Contract created",
        description: `Successfully ${existingContractId ? "updated" : "created"} contract for ${data.companyName}`,
      });

      // Reset form or call onComplete
      if (onComplete) {
        onComplete();
      } else {
        form.reset();
        setSelectedComplexityItems({});
        setAddonCustomPrices({});
        setAddonQuantities({});
        setSelectedPackage("");
        setSelectedModules([]);
        setShowCustomPricing(false);
      }
    } catch (error) {
      console.error('Error creating contract:', error);
      toast({
        title: "Failed to create contract",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-xl">{existingContractId ? 'Edit Contract' : 'Create New Contract'}</CardTitle>
      </CardHeader>
      <CardContent>
        {loadingContract ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Debug Panel - Development Only */}
            {process.env.NODE_ENV === 'development' && (
              <div className="mb-4 p-4 bg-yellow-100 border border-yellow-400 rounded text-xs font-mono">
                <div className="font-bold mb-2">🐛 Debug Info:</div>
                <div>Form Valid: {form.formState.isValid ? '✅ Yes' : '❌ No'}</div>
                <div>Is Submitting: {form.formState.isSubmitting ? '⏳ Yes' : '✅ No'}</div>
                <div>Error Count: {Object.keys(form.formState.errors).length}</div>
                {Object.keys(form.formState.errors).length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer font-semibold">View Errors</summary>
                    <div className="mt-2 space-y-1">
                      {Object.entries(form.formState.errors).map(([field, error]: [string, any]) => (
                        <div key={field} className="text-red-600">
                          <strong>{field}:</strong> {error?.message?.toString() || 'Invalid'}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField
                control={form.control}
                name="companyName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Enter company name" 
                        {...field} 
                        disabled={!!existingCustomer}
                        className={existingCustomer ? "bg-muted" : ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
            )}
            />
            
            <FormField
                control={form.control}
                name="initialMW"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Initial MW to be Onboarded</FormLabel>
                    <FormControl>
                  <Input type="number" step="0.01" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
          </div>

            <FormField
              control={form.control}
              name="package"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Package</FormLabel>
                  <Select 
                    onValueChange={(value) => {
                      field.onChange(value);
                      handlePackageChange(value);
                    }} 
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select package" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="starter">AMMP OS Starter (Max 5MW, 20 sites, €3000/year)</SelectItem>
                      <SelectItem value="pro">AMMP OS Pro (Per MW pricing, min €5000/year)</SelectItem>
                      <SelectItem value="custom">Custom/Legacy</SelectItem>
                      <SelectItem value="hybrid_tiered">Hybrid Tiered (Different pricing for on-grid vs hybrid sites)</SelectItem>
                      <SelectItem value="hybrid_tiered_assetgroups">Hybrid Tiered + Asset Groups (Hybrid pricing with asset group filtering)</SelectItem>
                      <SelectItem value="capped">Capped Package (Fixed annual fee with MW cap)</SelectItem>
                      <SelectItem value="poc">POC/Trial (No billing - expiry tracking only)</SelectItem>
                      <SelectItem value="per_site">Per-Site (Fixed fees per site for onboarding + annual subscription)</SelectItem>
                      <SelectItem value="elum_epm">Elum ePM (Asset group with site-size threshold pricing)</SelectItem>
                      <SelectItem value="elum_jubaili">Elum Jubaili (Asset group with per-site pricing)</SelectItem>
                      <SelectItem value="elum_portfolio_os">Elum Portfolio OS (Custom org with full pricing flexibility)</SelectItem>
                      <SelectItem value="elum_internal">Elum Internal Assets (Graduated MW pricing)</SelectItem>
                      <SelectItem value="ammp_os_2026">AMMP OS 2026 (New pricing: 5 modules, trial option)</SelectItem>
                      <SelectItem value="sps_monitoring">SPS Monitoring (3 stacking discounts, quarterly billing, €100k min)</SelectItem>
                      <SelectItem value="solar_africa_api">SolarAfrica API (Municipality-based tiered pricing)</SelectItem>
                      {customContractTypes.length > 0 && (
                        <>
                          <SelectSeparator />
                          {customContractTypes.map((ct: any) => (
                            <SelectItem key={ct.slug} value={ct.slug}>
                              {ct.name}{ct.description ? ` (${ct.description})` : ''}
                            </SelectItem>
                          ))}
                        </>
                      )}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {watchPackage === "starter" ? 
                      "AMMP OS Starter: Max 5MW, max 20 sites, €3000 per year flat fee. Only have access to Technical Monitoring Module." :
                      watchPackage === "pro" ? 
                      "AMMP OS Pro: Pricing per MW based on modules chosen, with a minimum of €5,000 per year." :
                      watchPackage === "hybrid_tiered" ? 
                      "Hybrid Tiered: Set different rates for on-grid and hybrid sites (with battery/genset)." :
                      watchPackage === "hybrid_tiered_assetgroups" ?
                      "Hybrid Tiered + Asset Groups: Different rates for on-grid and hybrid sites, plus asset group filtering for scoped contracts." :
                      watchPackage === "capped" ?
                      "Capped Package: Fixed fee (pro-rated for selected billing frequency) with optional MW cap alerts." :
                      watchPackage === "poc" ?
                      "POC/Trial: Track proof-of-concept trials with expiry notifications. No invoicing or billing." :
                      watchPackage === "per_site" ?
                      "Per-Site: Fixed fee per site for onboarding (one-time) and annual subscription. Sites are billed individually on their anniversary." :
                      watchPackage === "elum_epm" ?
                      "Elum ePM: Filter to specific AMMP asset group with different per-kWp pricing based on site size threshold." :
                      watchPackage === "elum_jubaili" ?
                      "Elum Jubaili: Filter to specific AMMP asset group with flat per-site pricing." :
                      watchPackage === "elum_portfolio_os" ?
                      "Elum Portfolio OS: Use a separate AMMP org ID with full pricing flexibility (modules, addons, custom pricing)." :
                      watchPackage === "elum_internal" ?
                      "Elum Internal Assets: Graduated MW pricing with different rates for different MW tiers (e.g., €150/MW for 0-100MW, €75/MW for 100-500MW)." :
                      watchPackage === "ammp_os_2026" ?
                      "AMMP OS 2026: 5 modules with per-MWp pricing, optional trial toggle (50% off modules + setup fees), and updated add-ons." :
                      watchPackage === "solar_africa_api" ?
                      "SolarAfrica API: API subscription priced by municipality count with tiered annual pricing. Includes one-time setup fee and optional customization work." :
                      watchPackage === "sps_monitoring" ?
                      "SPS Monitoring: Module-based pricing with 3 stacking discounts (Volume, Upfront 5%, Commitment 3%). Quarterly billing with €100,000 minimum annual value." :
                      "Custom/Legacy: Use custom pricing for this customer."}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="contractName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contract Name (Optional)</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="e.g., Main Agreement 2024, Extension Contract" 
                      {...field} 
                    />
                  </FormControl>
                  <FormDescription>
                    A friendly name to identify this contract when there are multiple
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* SPS Monitoring Discount Fields */}
            {watchPackage === "sps_monitoring" && (
              <div className="space-y-4 p-4 border-l-4 border-primary rounded-md bg-muted/30">
                <h3 className="font-medium">SPS Monitoring Discounts</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="upfront-discount">Upfront Discount (%)</Label>
                    <Input
                      id="upfront-discount"
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={upfrontDiscountPercent}
                      onChange={(e) => setUpfrontDiscountPercent(Number(e.target.value) || 0)}
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Default: 5% for paying annual fee upfront</p>
                  </div>
                  
                  <div>
                    <Label htmlFor="commitment-discount">Commitment Discount (%)</Label>
                    <Input
                      id="commitment-discount"
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={commitmentDiscountPercent}
                      onChange={(e) => setCommitmentDiscountPercent(Number(e.target.value) || 0)}
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Default: 3% for 3-year commitment</p>
                  </div>
                </div>

                <div className="text-sm space-y-1 text-muted-foreground">
                  <p className="font-medium text-foreground">Discount Stacking Order:</p>
                  <ol className="list-decimal pl-4 space-y-0.5">
                    <li>Volume Discount (from portfolio discount tiers below)</li>
                    <li>Upfront Discount ({upfrontDiscountPercent}%)</li>
                    <li>Commitment Discount ({commitmentDiscountPercent}%)</li>
                  </ol>
                  <p className="mt-2">Discounted fee is then compared against the Minimum Annual Value (pro-rated for billing period).</p>
                </div>
              </div>
            )}

            {/* AMMP OS 2026 Trial Toggle */}
            {watchPackage === "ammp_os_2026" && (
              <div className="space-y-4 p-4 border-l-4 border-primary rounded-md bg-muted/30">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="trial-toggle"
                    checked={isTrial}
                    onCheckedChange={(checked) => {
                      setIsTrial(!!checked);
                      form.setValue("isTrial", !!checked);
                    }}
                  />
                  <label htmlFor="trial-toggle" className="font-medium cursor-pointer">
                    Trial Contract
                  </label>
                </div>
                {isTrial && (
                  <div className="text-sm space-y-1 pl-6">
                    <p className="text-muted-foreground">Trial pricing applied:</p>
                    <ul className="list-disc pl-4 text-muted-foreground">
                      <li>Module subscription: <strong>50% off</strong></li>
                      <li>Setup fee: <strong>€{TRIAL_2026.setupFee.toLocaleString()}</strong> (one-time)</li>
                      <li>Vendor API Onboarding: <strong>€{TRIAL_2026.vendorApiOnboardingFee}</strong> (one-time)</li>
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* SolarAfrica API Package Fields */}
            {watchPackage === "solar_africa_api" && (
              <div className="space-y-4 p-4 border-l-4 border-primary rounded-md bg-muted/30">
                <h3 className="font-medium">SolarAfrica API Pricing</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="municipality-count">Municipality Count</Label>
                    <Input
                      id="municipality-count"
                      type="number"
                      min="0"
                      value={municipalityCount}
                      onChange={(e) => setMunicipalityCount(Number(e.target.value) || 0)}
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Manually tracked number of municipalities</p>
                  </div>
                  
                  <div>
                    <Label>Applicable Tier</Label>
                    <div className="mt-1 p-2 bg-muted rounded-md">
                      {municipalityCount > 0 ? (
                        <>
                          <p className="font-medium">Tier {getSolarAfricaTier(municipalityCount).tier}: {getSolarAfricaTier(municipalityCount).label}</p>
                          <p className="text-sm text-muted-foreground">Annual fee: €{getSolarAfricaTier(municipalityCount).annualFee.toLocaleString()}</p>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">Enter municipality count to see tier</p>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="api-setup-fee">Setup Fee (one-time)</Label>
                    <Input
                      id="api-setup-fee"
                      type="number"
                      min="0"
                      value={apiSetupFee}
                      onChange={(e) => setApiSetupFee(Number(e.target.value) || 0)}
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Default: €{SOLAR_AFRICA_SETUP_FEE.toLocaleString()}</p>
                  </div>
                  
                  <div>
                    <Label htmlFor="hourly-rate">Customization Hourly Rate</Label>
                    <Input
                      id="hourly-rate"
                      type="number"
                      min="0"
                      value={hourlyRate}
                      onChange={(e) => setHourlyRate(Number(e.target.value) || 0)}
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Default: €{SOLAR_AFRICA_CUSTOMIZATION_HOURLY_RATE}/hr</p>
                  </div>
                </div>
                
                <div className="text-sm space-y-1">
                  <p className="font-medium">Tier Summary:</p>
                  <div className="grid grid-cols-5 gap-2">
                    {SOLAR_AFRICA_MUNICIPALITY_TIERS.map(tier => (
                      <div key={tier.tier} className={`p-2 rounded text-center text-xs ${
                        municipalityCount > 0 && getSolarAfricaTier(municipalityCount).tier === tier.tier 
                          ? 'bg-primary/10 border border-primary' 
                          : 'bg-muted'
                      }`}>
                        <div className="font-medium">≤{tier.maxMunicipalities}</div>
                        <div>€{tier.annualFee.toLocaleString()}/yr</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {watchPackage === "per_site" && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4" />
                          Contract Currency
                        </FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select currency" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="USD">USD ($)</SelectItem>
                            <SelectItem value="EUR">EUR (€)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="onboardingFeePerSite"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Onboarding Fee Per Site ({form.watch("currency") === 'USD' ? '$' : '€'})</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="1000"
                            {...field}
                            onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                          />
                        </FormControl>
                        <FormDescription>
                          One-time setup fee charged when a site is onboarded
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="annualFeePerSite"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Annual Fee Per Site ({form.watch("currency") === 'USD' ? '$' : '€'})</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="1000"
                            {...field}
                            onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                          />
                        </FormControl>
                        <FormDescription>
                          Annual subscription fee charged on each site's anniversary
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="nextInvoiceDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <CalendarIcon className="h-4 w-4" />
                          Next Invoice Check Date
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Monthly check for sites due for onboarding or annual renewal
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="rounded-md bg-muted p-4 text-sm text-muted-foreground">
                  <p className="font-medium mb-1">Monthly Invoice Check</p>
                  <p>Per-site contracts appear in the invoice creator every month to capture new site onboarding fees and annual renewal anniversaries as they occur.</p>
                </div>
              </>
            )}

            {/* Elum Internal Assets package fields */}
            {watchPackage === "elum_internal" && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4" />
                          Contract Currency
                        </FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select currency" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="USD">USD ($)</SelectItem>
                            <SelectItem value="EUR">EUR (€)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="billingFrequency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Billing Frequency</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select frequency" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="quarterly">Quarterly</SelectItem>
                            <SelectItem value="biannual">Bi-annual</SelectItem>
                            <SelectItem value="annual">Annual</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="nextInvoiceDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <CalendarIcon className="h-4 w-4" />
                          Next Invoice Date
                        </FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="minimumAnnualValue"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Minimum Annual Value</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} />
                        </FormControl>
                        <FormDescription>Optional minimum contract value</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <GraduatedMWTierEditor
                  tiers={graduatedMWTiers}
                  onTiersChange={setGraduatedMWTiers}
                  currentMW={form.watch('initialMW')}
                  currencySymbol={form.watch('currency') === 'USD' ? '$' : '€'}
                />
              </>
            )}

            {/* Elum ePM package fields */}
            {watchPackage === "elum_epm" && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4" />
                          Contract Currency
                        </FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select currency" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="USD">USD ($)</SelectItem>
                            <SelectItem value="EUR">EUR (€)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="billingFrequency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Billing Frequency</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select frequency" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="quarterly">Quarterly</SelectItem>
                            <SelectItem value="biannual">Bi-annual</SelectItem>
                            <SelectItem value="annual">Annual</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="nextInvoiceDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <CalendarIcon className="h-4 w-4" />
                          Next Invoice Date
                        </FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormDescription>
                          When the next invoice is due for this contract
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="siteSizeThresholdKwp"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Site Size Threshold (kWp)</FormLabel>
                        <FormControl>
                          <Input type="number" step="1" placeholder="100" {...field} onChange={e => field.onChange(e.target.valueAsNumber || 100)} />
                        </FormControl>
                        <FormDescription>Sites ≤ this size use below-threshold pricing</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                <FormField
                    control={form.control}
                    name="belowThresholdPricePerMWp"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Price/MWp (≤ threshold)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" placeholder="50" {...field} onChange={e => field.onChange(e.target.valueAsNumber || 50)} />
                        </FormControl>
                        <FormDescription>Annual price per MWp for sites ≤ threshold</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="aboveThresholdPricePerMWp"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Price/MWp (&gt; threshold)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" placeholder="30" {...field} onChange={e => field.onChange(e.target.valueAsNumber || 30)} />
                        </FormControl>
                        <FormDescription>Annual price per MWp for sites &gt; threshold</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </>
            )}

            {/* Elum Jubaili package fields */}
            {watchPackage === "elum_jubaili" && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contract Currency</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Select currency" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="USD">USD ($)</SelectItem>
                            <SelectItem value="EUR">EUR (€)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="annualFeePerSite"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Per-Site Fee ({form.watch("currency") === 'USD' ? '$' : '€'})</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" placeholder="500" {...field} onChange={e => field.onChange(e.target.valueAsNumber || 500)} />
                        </FormControl>
                        <FormDescription>Flat fee charged per site in the asset group</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="billingFrequency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Billing Frequency</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Select frequency" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="quarterly">Quarterly</SelectItem>
                            <SelectItem value="biannual">Bi-annual</SelectItem>
                            <SelectItem value="annual">Annual</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="nextInvoiceDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <CalendarIcon className="h-4 w-4" />
                          Next Invoice Date
                        </FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormDescription>
                          When the next invoice is due for this contract
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </>
            )}

            {/* Billing fields - hidden for POC, per_site, and Elum ePM/Jubaili packages (which have their own billing fields) */}
            {watchPackage !== "poc" && watchPackage !== "per_site" && watchPackage !== "elum_epm" && watchPackage !== "elum_jubaili" && (
              <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Contract Currency
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select currency" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="USD">USD ($)</SelectItem>
                        <SelectItem value="EUR">EUR (€)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Currency for this contract's invoices
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="billingFrequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <CalendarIcon className="h-4 w-4" />
                      Billing Frequency
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select frequency" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="biannual">Bi-annual</SelectItem>
                        <SelectItem value="annual">Annual</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      How often invoices will be generated
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="invoicingType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Invoicing Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || "standard"}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select invoicing type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="standard">Standard (Create invoices here)</SelectItem>
                      <SelectItem value="manual">Manual (Invoiced externally, mark as sent)</SelectItem>
                      <SelectItem value="automated">Automated (Xero repeating invoice)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Standard: Create and send invoices from this app. Manual: Mark as sent when invoiced externally. Automated: Managed automatically in Xero.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="baseMonthlyPrice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Base Monthly Price</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      {...field}
                      onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                    />
                  </FormControl>
                  <FormDescription>
                    Fixed monthly base fee. This will appear as a separate line item on invoices and be multiplied by the billing period.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Retainer Hours Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="retainerHours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Retainer Hours (per period)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.5"
                        placeholder="0"
                        {...field}
                        onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                      />
                    </FormControl>
                    <FormDescription>
                      Hours included per billing period
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="retainerHourlyRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Retainer Hourly Rate ({form.watch("currency") === 'USD' ? '$' : '€'})</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        {...field}
                        onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                      />
                    </FormControl>
                    <FormDescription>
                      Hourly rate for retainer hours
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="retainerMinimumValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Retainer Minimum ({form.watch("currency") === 'USD' ? '$' : '€'})</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        {...field}
                        onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                      />
                    </FormControl>
                    <FormDescription>
                      Minimum retainer charge per period (optional)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="nextInvoiceDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    Next Invoice Date
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    This date will be used to track when the next invoice is due
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
              </>
            )}

            {/* Contract-level dates */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="signedDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <CalendarIcon className="h-4 w-4" />
                      Contract Signed Date
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Date when contract was signed
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contractExpiryDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <CalendarIcon className="h-4 w-4" />
                      Contract Expiry Date
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      When the contract term ends (triggers expiration notifications)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Billing period dates - hidden for POC */}
            {watchPackage !== 'poc' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="periodStart"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <CalendarIcon className="h-4 w-4" />
                        Billing Period Start
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Start of current billing period
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="periodEnd"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <CalendarIcon className="h-4 w-4" />
                        Billing Period End
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        End of current billing period
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
            
            {/* Capped Package Fields */}
            {watchPackage === "capped" && (
              <div className="space-y-4 p-4 border-l-4 border-primary rounded-md bg-muted/30">
                <h3 className="font-semibold text-sm">Capped Package Configuration</h3>
                <p className="text-xs text-muted-foreground">
                  Configure optional MW cap alerts. The fixed fee is pro-rated based on your selected billing frequency.
                </p>
                <FormField
                  control={form.control}
                  name="maxMw"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Maximum MW Cap (Optional)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01"
                          placeholder="Leave blank for unlimited capacity"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Set an MW limit to receive notifications when approached or exceeded. Leave blank for unlimited capacity.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
            
            {/* Package Selector Component - Modules & Addons (hidden for capped and poc) */}
            {watchPackage !== "capped" && watchPackage !== "poc" && (
            <ContractPackageSelector
              selectedPackage={watchPackage || ""}
              selectedModules={watchModules || []}
              selectedAddons={watchAddons || []}
              addonComplexity={selectedComplexityItems}
              addonCustomPrices={addonCustomPrices}
              addonQuantities={addonQuantities}
              addonCustomTiers={addonCustomTiers}
              customPricing={form.watch("customPricing")}
              showCustomPricing={showCustomPricing}
              onModuleToggle={(moduleId) => handleModuleSelection(moduleId, !watchModules?.includes(moduleId))}
              onAddonToggle={(addonId) => handleAddonSelection(addonId, !watchAddons?.includes(addonId))}
              onComplexityChange={handleComplexityChange}
              onCustomPriceChange={(id, price) => setAddonCustomPrices({...addonCustomPrices, [id]: price})}
              onQuantityChange={(id, qty) => setAddonQuantities({...addonQuantities, [id]: qty})}
              onCustomTiersChange={(addonId, tiers) => {
                setAddonCustomTiers(prev => ({
                  ...prev,
                  [addonId]: tiers
                }));
              }}
              onDeliverableTypeChange={(addonId, type) => {
                setAddonDeliverableTypes(prev => ({ ...prev, [addonId]: type }));
              }}
              addonDeliverableTypes={addonDeliverableTypes}
              modules={isPackage2026(watchPackage) ? MODULES_2026 : MODULES}
              addons={isPackage2026(watchPackage) ? ADDONS_2026 : ADDONS}
              mutuallyExclusiveModules={isPackage2026(watchPackage) ? MUTUALLY_EXCLUSIVE_2026 : undefined}
              currency={form.watch("currency")}
              mode="contract"
              renderModuleInput={(moduleId) => {
                const moduleList = isPackage2026(watchPackage) ? MODULES_2026 : MODULES;
                return (
                  <FormField
                    control={form.control}
                    name={`customPricing.${moduleId}` as any}
                    render={({ field }) => (
                      <Input 
                        id={`custom-${moduleId}`} 
                        type="number" 
                        placeholder={`Default: €${moduleList.find(m => m.id === moduleId)?.price}`}
                        className="mt-1 h-8"
                        value={field.value || ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          field.onChange(value === '' ? undefined : Number(value));
                        }}
                        onBlur={field.onBlur}
                      />
                    )}
                  />
                );
              }}
            />
            )}
            
            {/* Hybrid Tiered Pricing Section */}
            {(watchPackage === "hybrid_tiered" || watchPackage === "hybrid_tiered_assetgroups") && (
              <div className="space-y-4 p-4 border-l-4 border-primary rounded-md bg-muted/30">
                <h3 className="font-semibold text-sm">Hybrid Tiered Pricing</h3>
                <p className="text-xs text-muted-foreground">
                  Set different per-MWp pricing for on-grid sites vs hybrid sites (with battery/genset)
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="customPricing.ongrid_per_mwp"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>On-Grid Price (€/MWp/year)</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder="e.g., 1200"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="customPricing.hybrid_per_mwp"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Hybrid Price (€/MWp/year)</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder="e.g., 1800"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            )}
            
            {/* Pricing fields - hidden for POC */}
            {watchPackage !== "poc" && (
              <>
            <FormField
              control={form.control}
              name="minimumAnnualValue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {watchPackage === "capped" 
                      ? `Fixed Annual Fee (${form.watch("currency")})` 
                      : "Minimum Annual Contract Value"}
                  </FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0" {...field} />
                  </FormControl>
                  <FormDescription>
                    {watchPackage === "capped"
                      ? "The fixed annual fee for this capped package contract"
                      : "Minimum annual value for this contract (e.g., €5,000 for Pro). Will be pro-rated based on billing frequency."}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <ContractPdfUploader 
              onOcrComplete={handleOcrComplete}
              contractId={existingContractId || undefined}
            />
            
            {/* Volume Discounts Section - Now using Tier Editors */}
            <div className="space-y-4">
              <DiscountTierEditor
                tiers={portfolioDiscountTiers}
                onTiersChange={setPortfolioDiscountTiers}
                currentMW={form.watch("initialMW")}
              />
              
              <div className="border rounded-md p-4">
                <h3 className="font-semibold mb-4">Other Discounts</h3>
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="volumeDiscounts.annualUpfrontDiscount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Annual Upfront Payment Discount (%)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.1" min="0" max="100" {...field} />
                        </FormControl>
                        <FormDescription>
                          Discount applied when customer pays annually upfront (default: 5%)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="volumeDiscounts.siteSizeThreshold"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Site Size Threshold (MW)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.1" min="0" {...field} />
                          </FormControl>
                          <FormDescription>
                            Minimum site size for discount (default: 3MW)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="volumeDiscounts.siteSizeDiscount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Site Size Discount (%)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.1" min="0" max="100" {...field} />
                          </FormControl>
                          <FormDescription>
                            Discount for sites above threshold
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>
              
              <FormField
                control={form.control}
                name="siteChargeFrequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Site Charge Frequency</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || "annual"}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select frequency" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="annual">Annual</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Is the per-site charge monthly or annual?
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <MinimumChargeTierEditor
                tiers={minimumChargeTiers}
                onTiersChange={setMinimumChargeTiers}
                currentMW={form.watch("initialMW")}
                currencySymbol={form.watch("currency") === "USD" ? "$" : "€"}
                frequency={form.watch("siteChargeFrequency") as any}
              />
            </div>
              </>
            )}
            
            {/* AMMP Configuration Section - show for all non-POC packages */}
            {watchPackage !== "poc" && (
              <div className="space-y-4 p-4 border rounded-lg bg-muted/20">
                <h3 className="font-semibold">AMMP Configuration</h3>
                <p className="text-sm text-muted-foreground">
                  Configure AMMP integration for automatic asset syncing
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="contractAmmpOrgId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>AMMP Organization ID</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., org_abc123" {...field} />
                        </FormControl>
                        <FormDescription>
                          Enter the AMMP organization ID to sync assets
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {existingContractId && (
                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={async () => {
                          if (!existingContractId) return;
                          setIsSyncing(true);
                          try {
                            const { data, error } = await supabase.functions.invoke('ammp-sync-contract', {
                              body: { contractId: existingContractId }
                            });
                            if (error) throw error;
                            if (data.success) {
                              toast({
                                title: "AMMP sync complete",
                                description: `Synced ${data.totalSites} sites (${data.totalMW?.toFixed(4)} MW)`,
                              });
                              // Refresh the page to show updated data
                              window.location.reload();
                            } else {
                              throw new Error(data.error || 'Sync failed');
                            }
                          } catch (err: any) {
                            toast({
                              title: "Sync failed",
                              description: err.message,
                              variant: "destructive",
                            });
                          } finally {
                            setIsSyncing(false);
                          }
                        }}
                        disabled={isSyncing || (!form.watch('contractAmmpOrgId') && !form.watch('ammpAssetGroupId'))}
                      >
                        <RefreshCw className={cn("mr-2 h-4 w-4", isSyncing && "animate-spin")} />
                        {isSyncing ? 'Syncing...' : 'Sync from AMMP'}
                      </Button>
                    </div>
                  )}
                </div>

                {/* Asset Group Selectors - for Elum-style filtering */}
                {(watchPackage === "elum_epm" || watchPackage === "elum_jubaili" || watchPackage === "elum_portfolio_os" || watchPackage === "elum_internal" || watchPackage === "hybrid_tiered_assetgroups" || form.watch('ammpAssetGroupId')) && (
                  <div className="space-y-4 mt-4 pt-4 border-t">
                    <h4 className="text-sm font-medium">Asset Group Filtering</h4>
                    <AssetGroupSelector
                      orgId={form.watch('contractAmmpOrgId') || undefined}
                      value={form.watch('ammpAssetGroupId') || ''}
                      onSelect={(id, name) => {
                        form.setValue('ammpAssetGroupId', id);
                        form.setValue('ammpAssetGroupName', name);
                      }}
                      label="Primary Asset Group"
                      optional
                      showClearButton
                      onClear={() => {
                        form.setValue('ammpAssetGroupId', '');
                        form.setValue('ammpAssetGroupName', '');
                      }}
                    />
                    
                    <AssetGroupSelector
                      orgId={form.watch('contractAmmpOrgId') || undefined}
                      value={form.watch('ammpAssetGroupIdAnd') || ''}
                      onSelect={(id, name) => {
                        form.setValue('ammpAssetGroupIdAnd', id);
                        form.setValue('ammpAssetGroupNameAnd', name);
                      }}
                      label="Secondary Asset Group (AND)"
                      optional
                      showClearButton
                      onClear={() => {
                        form.setValue('ammpAssetGroupIdAnd', '');
                        form.setValue('ammpAssetGroupNameAnd', '');
                      }}
                    />
                    
                    <AssetGroupSelector
                      orgId={form.watch('contractAmmpOrgId') || undefined}
                      value={form.watch('ammpAssetGroupIdNot') || ''}
                      onSelect={(id, name) => {
                        form.setValue('ammpAssetGroupIdNot', id);
                        form.setValue('ammpAssetGroupNameNot', name);
                      }}
                      label="Exclusion Asset Group (NOT)"
                      optional
                      showClearButton
                      onClear={() => {
                        form.setValue('ammpAssetGroupIdNot', '');
                        form.setValue('ammpAssetGroupNameNot', '');
                      }}
                    />
                  </div>
                )}

                {/* Show cached capabilities if available */}
                {existingContract?.cachedCapabilities?.assetBreakdown && existingContract.cachedCapabilities.assetBreakdown.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium">Synced Assets</h4>
                      <Badge variant="secondary">
                        {existingContract.cachedCapabilities.totalSites} sites • {existingContract.cachedCapabilities.totalMW?.toFixed(2)} MW
                      </Badge>
                    </div>
                    <div className="max-h-48 overflow-auto border rounded text-sm">
                      <table className="w-full">
                        <thead className="bg-muted sticky top-0">
                          <tr>
                            <th className="text-left p-1.5 font-medium">Asset</th>
                            <th className="text-right p-1.5 font-medium">MW</th>
                            <th className="text-center p-1.5 font-medium">Hybrid</th>
                          </tr>
                        </thead>
                        <tbody>
                          {existingContract.cachedCapabilities.assetBreakdown.slice(0, 20).map((asset: any) => (
                            <tr key={asset.assetId} className="border-t">
                              <td className="p-1.5">{asset.assetName}</td>
                              <td className="p-1.5 text-right">{asset.totalMW?.toFixed(4)}</td>
                              <td className="p-1.5 text-center">{asset.isHybrid ? '✓' : '-'}</td>
                            </tr>
                          ))}
                          {existingContract.cachedCapabilities.assetBreakdown.length > 20 && (
                            <tr className="border-t">
                              <td colSpan={3} className="p-1.5 text-center text-muted-foreground">
                                +{existingContract.cachedCapabilities.assetBreakdown.length - 20} more assets...
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Additional Notes</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Additional notes about this contract" className="min-h-[100px]" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="flex justify-end space-x-2">
              <Button variant="outline" type="button" onClick={onCancel}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={form.formState.isSubmitting}
                onClick={() => {
                  console.log('💥 Button clicked!');
                  console.log('Form state:', form.formState);
                  console.log('Form errors:', form.formState.errors);
                  console.log('Form is valid:', form.formState.isValid);
                  console.log('Form values:', form.getValues());
                }}
              >
                {form.formState.isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {!form.formState.isSubmitting && <Save className="mr-2 h-4 w-4" />}
                {form.formState.isSubmitting ? 'Saving...' : 'Save Contract'}
              </Button>
            </div>
          </form>
          </Form>
        )}
      </CardContent>
    </Card>
  );
}

export default ContractForm;

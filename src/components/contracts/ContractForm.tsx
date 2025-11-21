
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContractPackageSelector } from "@/components/contracts/ContractPackageSelector";
import { ContractPdfUploader } from "@/components/contracts/ContractPdfUploader";
import { MODULES, ADDONS, type ComplexityLevel, type PricingTier } from "@/data/pricingData";
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
import { FileUp, Save, DollarSign, Calendar as CalendarIcon, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/contexts/CurrencyContext";
import { Badge } from "@/components/ui/badge";

// Define the form schema
const contractFormSchema = z.object({
  companyName: z.string().min(2, { message: "Company name is required" }),
  initialMW: z.coerce.number().min(0, { message: "Initial MW is required" }),
  currency: z.enum(["USD", "EUR"]),
  billingFrequency: z.enum(["monthly", "quarterly", "biannual", "annual"]),
  nextInvoiceDate: z.string().optional(),
  signedDate: z.string().optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  package: z.enum(["starter", "pro", "custom", "hybrid_tiered"]),
  modules: z.array(z.string()).optional(),
  addons: z.array(z.string()).optional(),
  addonCustomPricing: z.record(z.coerce.number().optional()).optional(),
  addonQuantities: z.record(z.coerce.number().optional()).optional(),
  customPricing: z.object({
    technicalMonitoring: z.coerce.number().optional(),
    energySavingsHub: z.coerce.number().optional(),
    stakeholderPortal: z.coerce.number().optional(),
    control: z.coerce.number().optional(),
    ongrid_per_mwp: z.coerce.number().optional(),
    hybrid_per_mwp: z.coerce.number().optional(),
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
  minimumCharge: z.coerce.number().optional(),
  minimumAnnualValue: z.coerce.number().optional(),
  notes: z.string().optional(),
  contractStatus: z.enum(["active", "pending", "expired", "cancelled"]).optional(),
});

type ContractFormValues = z.infer<typeof contractFormSchema>;

interface ContractFormProps {
  existingCustomer?: {
    id: string;
    name: string;
    location?: string;
    mwpManaged: number;
  };
  onComplete?: () => void;
  onCancel?: () => void;
}

// Module and addon definitions now imported from shared data file

export function ContractForm({ existingCustomer, onComplete, onCancel }: ContractFormProps) {
  const [selectedPackage, setSelectedPackage] = useState("");
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [showCustomPricing, setShowCustomPricing] = useState(false);
  const [selectedComplexityItems, setSelectedComplexityItems] = useState<{[key: string]: ComplexityLevel}>({});
  const [addonCustomPrices, setAddonCustomPrices] = useState<{[key: string]: number | undefined}>({});
  const [addonQuantities, setAddonQuantities] = useState<{[key: string]: number | undefined}>({});
  const [addonCustomTiers, setAddonCustomTiers] = useState<Record<string, PricingTier[]>>({});
  const [loadingContract, setLoadingContract] = useState(false);
  const [existingContractId, setExistingContractId] = useState<string | null>(null);
  const [uploadedPdfUrl, setUploadedPdfUrl] = useState<string | null>(null);
  const [ocrExtractedFields, setOcrExtractedFields] = useState<Set<string>>(new Set());
  const { currency: userCurrency} = useCurrency();

  const form = useForm<ContractFormValues>({
    resolver: zodResolver(contractFormSchema),
    defaultValues: {
      companyName: existingCustomer?.name || "",
      initialMW: existingCustomer?.mwpManaged || 0,
      currency: userCurrency || "EUR",
      billingFrequency: "annual",
      nextInvoiceDate: "",
      signedDate: "",
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
      minimumCharge: 0,
      minimumAnnualValue: 0,
      notes: "",
    },
  });

  // Load existing contract data if editing
  useEffect(() => {
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
        form.setValue('companyName', contract.company_name);
        form.setValue('initialMW', contract.initial_mw);
        form.setValue('currency', contract.currency as "USD" | "EUR");
        form.setValue('billingFrequency', contract.billing_frequency as "monthly" | "quarterly" | "biannual" | "annual");
        form.setValue('nextInvoiceDate', contract.next_invoice_date ? contract.next_invoice_date.split('T')[0] : '');
        form.setValue('signedDate', (contract as any).signed_date ? (contract as any).signed_date.split('T')[0] : '');
        form.setValue('periodStart', (contract as any).period_start ? (contract as any).period_start.split('T')[0] : '');
        form.setValue('periodEnd', (contract as any).period_end ? (contract as any).period_end.split('T')[0] : '');
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
    } else if (value === "hybrid_tiered") {
      // Remove technical monitoring from hybrid_tiered packages
      const currentModules = form.getValues("modules") || [];
      const filteredModules = currentModules.filter(id => id !== "technicalMonitoring");
      form.setValue("modules", filteredModules);
      setShowCustomPricing(false);
    } else {
      setShowCustomPricing(false);
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
    
    if (checked) {
      form.setValue("modules", [...currentModules, moduleId]);
    } else {
      form.setValue(
        "modules",
        currentModules.filter((id) => id !== moduleId)
      );
      // Modules and addons are now independent - no coupling!
    }
  };

  // Handle addon selection
  const handleAddonSelection = (addonId: string, checked: boolean) => {
    const currentAddons = form.getValues("addons") || [];
    
    if (checked) {
      form.setValue("addons", [...currentAddons, addonId]);
      
      // If the addon has complexity pricing, open a dialog or show fields to select complexity
      const addon = ADDONS.find(a => a.id === addonId);
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
      const enhancedAddons = (data.addons || []).map(addonId => {
        const addon = ADDONS.find(a => a.id === addonId);
        return {
          id: addonId,
          complexity: addon?.complexityPricing ? selectedComplexityItems[addonId] || 'low' : undefined,
          customPrice: addonCustomPrices[addonId],
          quantity: addonQuantities[addonId] || 1,
          customTiers: addonCustomTiers[addonId]
        };
      });

      // 3. Upsert contract (update if exists, create if not)
      const contractData: any = {
        customer_id: customer.id,
        company_name: data.companyName,
        package: data.package,
        initial_mw: data.initialMW,
        currency: data.currency,
        billing_frequency: data.billingFrequency,
        next_invoice_date: data.nextInvoiceDate || null,
        signed_date: data.signedDate || null,
        period_start: data.periodStart || null,
        period_end: data.periodEnd || null,
        modules: data.modules || [],
        addons: enhancedAddons,
        custom_pricing: data.customPricing || {},
        volume_discounts: data.volumeDiscounts || {},
        minimum_charge: data.minimumCharge || 0,
        minimum_annual_value: data.minimumAnnualValue || 0,
        notes: data.notes || '',
        contract_status: 'active',
        user_id: user.id,
        contract_pdf_url: uploadedPdfUrl || null,
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                name="periodStart"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <CalendarIcon className="h-4 w-4" />
                      Period Start Date
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
                      Period End Date
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
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {watchPackage === "starter" ? 
                      "AMMP OS Starter: Max 5MW, max 20 sites, €3000 per year flat fee. Only have access to Technical Monitoring Module." :
                      watchPackage === "pro" ? 
                      "AMMP OS Pro: Pricing per MW based on modules chosen, with a minimum of €5,000 per year." :
                      watchPackage === "hybrid_tiered" ? 
                      "Hybrid Tiered: Set different rates for on-grid and hybrid sites (with battery/genset)." :
                      "Custom/Legacy: Use custom pricing for this customer."}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {/* Package Selector Component - Modules & Addons */}
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
              currency={form.watch("currency")}
              mode="contract"
              renderModuleInput={(moduleId) => (
                <Input 
                  id={`custom-${moduleId}`} 
                  type="number" 
                  placeholder={`Default: €${MODULES.find(m => m.id === moduleId)?.price}`}
                  className="mt-1 h-8"
                  {...form.register(`customPricing.${moduleId}` as any, { valueAsNumber: true })}
                />
              )}
            />
            
            {/* Hybrid Tiered Pricing Section */}
            {watchPackage === "hybrid_tiered" && (
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
            
            <FormField
              control={form.control}
              name="minimumCharge"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Minimum Charge per Site</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0" {...field} />
                  </FormControl>
                  <FormDescription>
                    Minimum charge to be applied per site (if applicable)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="minimumAnnualValue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Minimum Annual Contract Value</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0" {...field} />
                  </FormControl>
                  <FormDescription>
                    Minimum annual value for this contract (e.g., €5,000 for Pro). 
                    Will be pro-rated based on billing frequency.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <ContractPdfUploader 
              onOcrComplete={handleOcrComplete}
              contractId={existingContractId || undefined}
            />
            
            {/* Volume Discounts Section - Moved to bottom */}
            <div className="border rounded-md p-4">
              <h3 className="font-semibold mb-4">Volume Discounts</h3>
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
                
                <div>
                  <Label className="mb-2 block">Portfolio Size Discounts (%)</Label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <FormField
                      control={form.control}
                      name="volumeDiscounts.portfolio50MW"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">50MW+</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.1" min="0" max="100" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="volumeDiscounts.portfolio100MW"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">100MW+</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.1" min="0" max="100" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="volumeDiscounts.portfolio150MW"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">150MW+</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.1" min="0" max="100" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="volumeDiscounts.portfolio200MW"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">200MW+</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.1" min="0" max="100" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>
            </div>
            
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
              <Button type="submit">
                <Save className="mr-2 h-4 w-4" />
                Save Contract
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

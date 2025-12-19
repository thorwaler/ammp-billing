import { useState, useEffect, useMemo } from "react";
import { CustomerInvoiceGroup } from "./CustomerInvoiceGroup";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { calculateInvoice } from "@/lib/invoiceCalculations";
import type { MinimumChargeTier, DiscountTier, GraduatedMWTier } from "@/data/pricingData";

export interface UpcomingInvoice {
  contractId: string;
  contractName?: string;
  customerId: string;
  customerName: string;
  nextInvoiceDate: string;
  billingFrequency: string;
  currency: string;
  packageType: string;
  mwpManaged: number;
  initialMW: number;
  modules: any[];
  addons: any[];
  minimumCharge: number;
  minimumChargeTiers: MinimumChargeTier[];
  portfolioDiscountTiers: DiscountTier[];
  minimumAnnualValue: number;
  customPricing: any;
  cachedCapabilities: any;
  manualInvoicing: boolean;
  baseMonthlyPrice: number;
  siteChargeFrequency: "monthly" | "annual";
  retainerHours: number;
  retainerHourlyRate: number;
  retainerMinimumValue: number;
  // Elum package fields
  siteSizeThresholdKwp?: number;
  belowThresholdPricePerMWp?: number;
  aboveThresholdPricePerMWp?: number;
  ammpAssetGroupId?: string;
  ammpAssetGroupIdAnd?: string;
  ammpAssetGroupIdNot?: string;
  // Elum Internal fields
  graduatedMWTiers?: GraduatedMWTier[];
  // Elum Jubaili fields
  annualFeePerSite?: number;
}

interface CustomerGroup {
  customerId: string;
  customerName: string;
  invoiceDate: string;
  contracts: UpcomingInvoice[];
}

interface UpcomingInvoicesListProps {
  onCreateInvoice: (invoice: UpcomingInvoice) => void;
  onCreateMergedInvoice?: (invoices: UpcomingInvoice[]) => void;
  refreshTrigger?: number;
}

export function UpcomingInvoicesList({ 
  onCreateInvoice, 
  onCreateMergedInvoice,
  refreshTrigger 
}: UpcomingInvoicesListProps) {
  const [invoices, setInvoices] = useState<UpcomingInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUpcomingInvoices();
  }, [refreshTrigger]);

  const loadUpcomingInvoices = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('contracts')
        .select(`
          id,
          contract_name,
          customer_id,
          next_invoice_date,
          billing_frequency,
          currency,
          package,
          modules,
          addons,
          minimum_charge,
          minimum_charge_tiers,
          portfolio_discount_tiers,
          minimum_annual_value,
          custom_pricing,
          initial_mw,
          manual_invoicing,
          base_monthly_price,
          site_charge_frequency,
          retainer_hours,
          retainer_hourly_rate,
          retainer_minimum_value,
          site_size_threshold_kwp,
          below_threshold_price_per_mwp,
          above_threshold_price_per_mwp,
          ammp_asset_group_id,
          ammp_asset_group_id_and,
          ammp_asset_group_id_not,
          cached_capabilities,
          graduated_mw_tiers,
          annual_fee_per_site,
          customers (
            id,
            name,
            nickname,
            mwp_managed
          )
        `)
        .eq('contract_status', 'active')
        .neq('package', 'poc')
        .not('next_invoice_date', 'is', null)
        .order('next_invoice_date', { ascending: true });

      if (error) throw error;

      const transformedInvoices: UpcomingInvoice[] = (data || [])
        .filter(c => c.customers)
        .map(c => {
          const customer = Array.isArray(c.customers) ? c.customers[0] : c.customers;
          
          const minimumChargeTiers = Array.isArray(c.minimum_charge_tiers) 
            ? c.minimum_charge_tiers as unknown as MinimumChargeTier[]
            : [];
          
          const portfolioDiscountTiers = Array.isArray(c.portfolio_discount_tiers)
            ? c.portfolio_discount_tiers as unknown as DiscountTier[]
            : [];
          
          return {
            contractId: c.id,
            contractName: c.contract_name || undefined,
            customerId: customer.id,
            customerName: customer.nickname || customer.name,
            nextInvoiceDate: c.next_invoice_date!,
            billingFrequency: c.billing_frequency || 'annual',
            currency: c.currency || 'EUR',
            packageType: c.package,
            mwpManaged: Number(customer.mwp_managed) || 0,
            initialMW: Number(c.initial_mw) || Number(customer.mwp_managed) || 0,
            modules: Array.isArray(c.modules) ? c.modules : [],
            addons: Array.isArray(c.addons) ? c.addons : [],
            minimumCharge: Number(c.minimum_charge) || 0,
            minimumChargeTiers,
            portfolioDiscountTiers,
            minimumAnnualValue: Number(c.minimum_annual_value) || 0,
            customPricing: typeof c.custom_pricing === 'object' ? c.custom_pricing : {},
            cachedCapabilities: (c as any).cached_capabilities || null,
            manualInvoicing: c.manual_invoicing || false,
            baseMonthlyPrice: Number(c.base_monthly_price) || 0,
            siteChargeFrequency: (c.site_charge_frequency as "monthly" | "annual") || "annual",
            retainerHours: Number((c as any).retainer_hours) || 0,
            retainerHourlyRate: Number((c as any).retainer_hourly_rate) || 0,
            retainerMinimumValue: Number((c as any).retainer_minimum_value) || 0,
            // Elum package fields
            siteSizeThresholdKwp: Number((c as any).site_size_threshold_kwp) || 100,
            belowThresholdPricePerMWp: Number((c as any).below_threshold_price_per_mwp) || 50,
            aboveThresholdPricePerMWp: Number((c as any).above_threshold_price_per_mwp) || 30,
            ammpAssetGroupId: (c as any).ammp_asset_group_id || undefined,
            ammpAssetGroupIdAnd: (c as any).ammp_asset_group_id_and || undefined,
            ammpAssetGroupIdNot: (c as any).ammp_asset_group_id_not || undefined,
            // Elum Internal fields
            graduatedMWTiers: Array.isArray((c as any).graduated_mw_tiers) 
              ? (c as any).graduated_mw_tiers as GraduatedMWTier[]
              : undefined,
            // Elum Jubaili fields
            annualFeePerSite: Number((c as any).annual_fee_per_site) || undefined,
          };
        });

      setInvoices(transformedInvoices);
    } catch (error) {
      console.error('Error loading upcoming invoices:', error);
      toast({
        title: "Error loading invoices",
        description: "Failed to load upcoming invoices. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const calculateEstimatedAmount = (invoice: UpcomingInvoice): number => {
    const frequencyMultipliers = {
      monthly: 1/12,
      quarterly: 0.25,
      biannual: 0.5,
      annual: 1
    };
    
    const multiplier = frequencyMultipliers[invoice.billingFrequency as keyof typeof frequencyMultipliers] || 1;
    
    // Use contract-level cached_capabilities as the source of truth
    const assetBreakdown = invoice.cachedCapabilities?.assetBreakdown 
      ? invoice.cachedCapabilities.assetBreakdown.map((asset: any) => ({
          assetId: asset.assetId,
          assetName: asset.assetName,
          totalMW: asset.totalMW,
          isHybrid: asset.isHybrid
        }))
      : undefined;
    
    // Calculate totalMW from cached capabilities
    const totalMW = assetBreakdown && assetBreakdown.length > 0
      ? assetBreakdown.reduce((sum: number, asset: any) => sum + (asset.totalMW || 0), 0)
      : invoice.mwpManaged;
    
    const selectedModules = Array.isArray(invoice.modules) 
      ? invoice.modules.map((m: any) => typeof m === 'string' ? m : m.id)
      : [];
    
    const selectedAddons = Array.isArray(invoice.addons)
      ? invoice.addons.map((a: any) => ({
          id: typeof a === 'string' ? a : a.id,
          complexity: a.complexity,
          customPrice: a.customPrice,
          quantity: a.quantity,
          customTiers: a.customTiers
        }))
      : [];
    
    const result = calculateInvoice({
      packageType: invoice.packageType as any,
      totalMW,
      selectedModules,
      selectedAddons,
      customPricing: invoice.customPricing,
      minimumCharge: invoice.minimumCharge,
      minimumChargeTiers: invoice.minimumChargeTiers,
      portfolioDiscountTiers: invoice.portfolioDiscountTiers,
      minimumAnnualValue: invoice.minimumAnnualValue,
      frequencyMultiplier: multiplier,
      ammpCapabilities: invoice.cachedCapabilities,
      assetBreakdown,
      enableSiteMinimumPricing: !!assetBreakdown && assetBreakdown.length > 0,
      baseMonthlyPrice: invoice.baseMonthlyPrice,
      billingFrequency: invoice.billingFrequency,
      siteChargeFrequency: invoice.siteChargeFrequency,
      retainerHours: invoice.retainerHours,
      retainerHourlyRate: invoice.retainerHourlyRate,
      retainerMinimumValue: invoice.retainerMinimumValue,
      // Elum package fields
      siteSizeThresholdKwp: invoice.siteSizeThresholdKwp,
      belowThresholdPricePerMWp: invoice.belowThresholdPricePerMWp,
      aboveThresholdPricePerMWp: invoice.aboveThresholdPricePerMWp,
      // Elum Internal fields
      graduatedMWTiers: invoice.graduatedMWTiers,
      // Elum Jubaili fields
      annualFeePerSite: invoice.annualFeePerSite,
    });
    
    return result.totalPrice;
  };

  // Group invoices by customer + date
  const groupedInvoices = useMemo((): CustomerGroup[] => {
    const groups = new Map<string, CustomerGroup>();
    
    for (const invoice of invoices) {
      // Use date only (not time) for grouping
      const dateKey = invoice.nextInvoiceDate.split('T')[0];
      const key = `${invoice.customerId}-${dateKey}`;
      
      if (!groups.has(key)) {
        groups.set(key, {
          customerId: invoice.customerId,
          customerName: invoice.customerName,
          invoiceDate: invoice.nextInvoiceDate,
          contracts: []
        });
      }
      
      // Add estimated amount to the invoice for display
      const estimatedAmount = invoice.packageType === 'per_site' ? null : calculateEstimatedAmount(invoice);
      
      groups.get(key)!.contracts.push({
        ...invoice,
        // Store estimated amount for display in the group
      });
    }
    
    // Sort by date
    return Array.from(groups.values()).sort((a, b) => 
      new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime()
    );
  }, [invoices]);

  const handleCreateIndividualInvoice = (contract: any) => {
    // Find the full invoice data
    const invoice = invoices.find(i => i.contractId === contract.contractId);
    if (invoice) {
      onCreateInvoice(invoice);
    }
  };

  const handleCreateMergedInvoice = (contracts: any[]) => {
    // Find full invoice data for all contracts
    const fullInvoices = contracts.map(c => 
      invoices.find(i => i.contractId === c.contractId)
    ).filter(Boolean) as UpcomingInvoice[];
    
    if (onCreateMergedInvoice && fullInvoices.length > 0) {
      onCreateMergedInvoice(fullInvoices);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg">No upcoming invoices found</p>
        <p className="text-sm mt-2">Create contracts with invoice dates to see them here</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {groupedInvoices.map((group) => (
        <div 
          key={`${group.customerId}-${group.invoiceDate}`}
          className={group.contracts.length > 1 ? "col-span-full" : ""}
        >
          <CustomerInvoiceGroup
            customerId={group.customerId}
            customerName={group.customerName}
            invoiceDate={group.invoiceDate}
            contracts={group.contracts.map(c => ({
              contractId: c.contractId,
              contractName: c.contractName,
              customerId: c.customerId,
              customerName: c.customerName,
              nextInvoiceDate: c.nextInvoiceDate,
              billingFrequency: c.billingFrequency,
              currency: c.currency,
              packageType: c.packageType,
              estimatedAmount: c.packageType === 'per_site' ? null : calculateEstimatedAmount(c),
              manualInvoicing: c.manualInvoicing,
            }))}
            onCreateIndividualInvoice={handleCreateIndividualInvoice}
            onCreateMergedInvoice={handleCreateMergedInvoice}
          />
        </div>
      ))}
    </div>
  );
}

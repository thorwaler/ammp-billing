import { useState, useEffect, useMemo } from "react";
import { CustomerInvoiceGroup } from "./CustomerInvoiceGroup";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { calculateInvoice } from "@/lib/invoiceCalculations";
import { addMonths, addYears } from "date-fns";
import { parseDateCET } from "@/lib/dateUtils";
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
  invoicingType: 'standard' | 'manual' | 'automated';
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
          invoicing_type,
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
            invoicingType: (c.invoicing_type as 'standard' | 'manual' | 'automated') || 'standard',
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

      // Auto-advance automated contracts with past due dates
      const now = new Date();
      const automatedPastDue = transformedInvoices.filter(inv => 
        inv.invoicingType === 'automated' && new Date(inv.nextInvoiceDate) < now
      );

      if (automatedPastDue.length > 0) {
        // Helper to calculate next date inline (since the function is defined later)
        const getNextDate = (currentDate: string, billingFrequency: string): Date => {
          const date = parseDateCET(currentDate);
          switch (billingFrequency) {
            case 'monthly': return addMonths(date, 1);
            case 'quarterly': return addMonths(date, 3);
            case 'biannual': return addMonths(date, 6);
            case 'annual': default: return addYears(date, 1);
          }
        };

        // Update each automated contract to next cycle
        for (const inv of automatedPastDue) {
          const nextDate = getNextDate(inv.nextInvoiceDate, inv.billingFrequency);
          await supabase
            .from('contracts')
            .update({
              next_invoice_date: nextDate.toISOString(),
              period_start: inv.nextInvoiceDate,
              period_end: nextDate.toISOString(),
            })
            .eq('id', inv.contractId);
          
          // Update local data
          inv.nextInvoiceDate = nextDate.toISOString();
        }
      }

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

  // Group invoices by customer + date + currency (prevents merging different currencies)
  const groupedInvoices = useMemo((): CustomerGroup[] => {
    const groups = new Map<string, CustomerGroup>();
    
    for (const invoice of invoices) {
      // Use date only (not time) for grouping, plus currency to prevent mixed-currency merges
      const dateKey = invoice.nextInvoiceDate.split('T')[0];
      const key = `${invoice.customerId}-${dateKey}-${invoice.currency}`;
      
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

  // Calculate the next invoice date based on billing frequency
  const calculateNextInvoiceDate = (currentDate: string, billingFrequency: string): Date => {
    const date = parseDateCET(currentDate);
    switch (billingFrequency) {
      case 'monthly':
        return addMonths(date, 1);
      case 'quarterly':
        return addMonths(date, 3);
      case 'biannual':
        return addMonths(date, 6);
      case 'annual':
      default:
        return addYears(date, 1);
    }
  };

  const handleSkipInvoice = async (contract: any) => {
    try {
      const invoice = invoices.find(i => i.contractId === contract.contractId);
      if (!invoice) return;

      const nextDate = calculateNextInvoiceDate(invoice.nextInvoiceDate, invoice.billingFrequency);
      
      const { error } = await supabase
        .from('contracts')
        .update({
          next_invoice_date: nextDate.toISOString(),
          period_start: invoice.nextInvoiceDate,
          period_end: nextDate.toISOString(),
        })
        .eq('id', contract.contractId);

      if (error) throw error;

      toast({
        title: "Invoice skipped",
        description: `Next invoice date moved to ${nextDate.toLocaleDateString()}`,
      });

      // Refresh the list
      loadUpcomingInvoices();
    } catch (error) {
      console.error('Error skipping invoice:', error);
      toast({
        title: "Error",
        description: "Failed to skip invoice. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleMarkAsSent = async (contract: any) => {
    try {
      const invoice = invoices.find(i => i.contractId === contract.contractId);
      if (!invoice) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch exchange rate from currency_settings
      const { data: currencySettings } = await supabase
        .from('currency_settings')
        .select('exchange_rate')
        .limit(1)
        .maybeSingle();
      const exchangeRate = currencySettings?.exchange_rate || 0.92;

      const nextDate = calculateNextInvoiceDate(invoice.nextInvoiceDate, invoice.billingFrequency);
      const estimatedAmount = calculateEstimatedAmount(invoice);
      
      // Calculate EUR amount
      const eurMultiplier = invoice.currency === 'USD' ? exchangeRate : 1;

      // Create invoice record marked as manual with all EUR fields
      const { error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          user_id: user.id,
          customer_id: invoice.customerId,
          contract_id: invoice.contractId,
          invoice_date: invoice.nextInvoiceDate,
          mw_managed: invoice.mwpManaged,
          total_mw: invoice.mwpManaged,
          invoice_amount: estimatedAmount,
          invoice_amount_eur: estimatedAmount * eurMultiplier,
          arr_amount: estimatedAmount, // Manual invoices are typically all ARR
          arr_amount_eur: estimatedAmount * eurMultiplier,
          nrr_amount: 0,
          nrr_amount_eur: 0,
          billing_frequency: invoice.billingFrequency,
          currency: invoice.currency,
          source: 'manual',
        });

      if (invoiceError) throw invoiceError;

      // Update contract with next invoice date
      const { error: contractError } = await supabase
        .from('contracts')
        .update({
          next_invoice_date: nextDate.toISOString(),
          period_start: invoice.nextInvoiceDate,
          period_end: nextDate.toISOString(),
        })
        .eq('id', contract.contractId);

      if (contractError) throw contractError;

      toast({
        title: "Invoice marked as sent",
        description: `Next invoice date moved to ${nextDate.toLocaleDateString()}`,
      });

      // Refresh the list
      loadUpcomingInvoices();
    } catch (error) {
      console.error('Error marking invoice as sent:', error);
      toast({
        title: "Error",
        description: "Failed to mark invoice as sent. Please try again.",
        variant: "destructive",
      });
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
              invoicingType: c.invoicingType,
            }))}
            onCreateIndividualInvoice={handleCreateIndividualInvoice}
            onCreateMergedInvoice={handleCreateMergedInvoice}
            onSkipInvoice={handleSkipInvoice}
            onMarkAsSent={handleMarkAsSent}
          />
        </div>
      ))}
    </div>
  );
}

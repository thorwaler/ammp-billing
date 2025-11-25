import { useState, useEffect } from "react";
import { InvoiceCard } from "./InvoiceCard";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { calculateInvoice } from "@/lib/invoiceCalculations";
import type { MinimumChargeTier, DiscountTier } from "@/data/pricingData";

interface UpcomingInvoice {
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
  ammpCapabilities: any;
  manualInvoicing: boolean;
  baseMonthlyPrice: number;
}

interface UpcomingInvoicesListProps {
  onCreateInvoice: (invoice: UpcomingInvoice) => void;
  refreshTrigger?: number;
}

export function UpcomingInvoicesList({ onCreateInvoice, refreshTrigger }: UpcomingInvoicesListProps) {
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
          customers (
            id,
            name,
            mwp_managed,
            ammp_capabilities
          )
        `)
        .eq('user_id', user.id)
        .eq('contract_status', 'active')
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
            customerId: customer.id,
            customerName: customer.name,
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
            ammpCapabilities: customer.ammp_capabilities || null,
            manualInvoicing: c.manual_invoicing || false,
            baseMonthlyPrice: Number(c.base_monthly_price) || 0,
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
    
    const assetBreakdown = invoice.ammpCapabilities?.assetBreakdown 
      ? invoice.ammpCapabilities.assetBreakdown.map((asset: any) => ({
          assetId: asset.assetId,
          assetName: asset.assetName,
          totalMW: asset.totalMW,
          isHybrid: asset.isHybrid
        }))
      : undefined;
    
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
      totalMW: invoice.mwpManaged,
      selectedModules,
      selectedAddons,
      customPricing: invoice.customPricing,
      minimumCharge: invoice.minimumCharge,
      minimumChargeTiers: invoice.minimumChargeTiers,
      portfolioDiscountTiers: invoice.portfolioDiscountTiers,
      minimumAnnualValue: invoice.minimumAnnualValue,
      frequencyMultiplier: multiplier,
      ammpCapabilities: invoice.ammpCapabilities,
      assetBreakdown,
      enableSiteMinimumPricing: !!assetBreakdown && assetBreakdown.length > 0,
      baseMonthlyPrice: invoice.baseMonthlyPrice,
      billingFrequency: invoice.billingFrequency,
    });
    
    return result.totalPrice;
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
      {invoices.map((invoice) => (
        <InvoiceCard
          key={invoice.customerId}
          contractId={invoice.customerId}
          customerName={invoice.customerName}
          nextInvoiceDate={invoice.nextInvoiceDate}
          billingFrequency={invoice.billingFrequency}
          currency={invoice.currency}
          packageType={invoice.packageType}
          estimatedAmount={calculateEstimatedAmount(invoice)}
          manualInvoicing={invoice.manualInvoicing}
          onCreateInvoice={() => onCreateInvoice(invoice)}
        />
      ))}
    </div>
  );
}

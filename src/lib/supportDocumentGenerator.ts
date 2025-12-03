import { supabase } from "@/integrations/supabase/client";
import { CalculationResult, getFrequencyMultiplier } from "./invoiceCalculations";
import { format, startOfYear, endOfYear } from "date-fns";

export interface SupportDocumentData {
  // Header info
  customerName: string;
  currency: 'EUR' | 'USD';
  invoiceDate: Date;
  invoicePeriod: string;
  discountPercent: number;
  
  // Year-to-date invoices
  yearInvoices: {
    period: string;
    monitoringFee: number;
    solcastFee: number;
    additionalWork: number;
    total: number;
  }[];
  yearTotal: number;
  
  // Asset breakdown table
  assetBreakdown: {
    assetId: string;
    assetName: string;
    pvCapacityKWp: number;
    isPV: boolean;
    isHybrid: boolean;
    hubActive: boolean;
    portalActive: boolean;
    controlActive: boolean;
    reportingActive: boolean;
    pricePerKWp: number;
    pricePerYear: number;
  }[];
  assetBreakdownTotal: number;
  
  // Solcast table (if applicable)
  solcastBreakdown?: {
    month: string;
    siteCount: number;
    pricePerSite: number;
    totalPerMonth: number;
  }[];
  solcastTotal?: number;
  
  // Other addons (excluding Solcast)
  addonsBreakdown?: {
    addonId: string;
    addonName: string;
    quantity?: number;
    pricePerUnit?: number;
    totalCost: number;
  }[];
  addonsTotal?: number;
  
  // Retainer breakdown (if applicable)
  retainerBreakdown?: {
    hours: number;
    hourlyRate: number;
    minimumValue: number;
    calculatedCost: number;
    totalCost: number;
    minimumApplied: boolean;
  };
  
  // Validation
  calculatedTotal: number;
  invoiceTotal: number;
  totalsMatch: boolean;
}

/**
 * Generate support document data from calculation result
 */
export async function generateSupportDocumentData(
  customerId: string,
  customerName: string,
  currency: 'EUR' | 'USD',
  invoiceDate: Date,
  calculationResult: CalculationResult,
  selectedModules: string[],
  selectedAddons: Array<{ id: string; quantity?: number }>,
  ammpCapabilities: any,
  packageType: string,
  billingFrequency: string,
  discountPercent: number = 0,
  periodStart?: string,
  periodEnd?: string
): Promise<SupportDocumentData> {
  
  // Fetch year-to-date invoices
  const yearStart = startOfYear(invoiceDate);
  const yearEnd = endOfYear(invoiceDate);
  
  const { data: yearInvoices, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('customer_id', customerId)
    .gte('invoice_date', yearStart.toISOString())
    .lte('invoice_date', yearEnd.toISOString())
    .order('invoice_date', { ascending: true });

  if (error) {
    console.error('Error fetching year invoices:', error);
  }

  // Group invoices by period
  const invoicesByPeriod = groupInvoicesByPeriod(yearInvoices || [], billingFrequency);
  const yearTotal = (yearInvoices || []).reduce((sum, inv) => sum + Number(inv.invoice_amount), 0);

  // Generate asset breakdown
  const assetBreakdown = generateAssetBreakdown(
    ammpCapabilities?.assetBreakdown || [],
    calculationResult,
    selectedModules,
    selectedAddons,
    packageType
  );

  const assetBreakdownTotal = assetBreakdown.reduce((sum, asset) => sum + asset.pricePerYear, 0);

  // Generate Solcast breakdown if applicable
  let solcastBreakdown: SupportDocumentData['solcastBreakdown'];
  let solcastTotal = 0;

  const solcastAddon = calculationResult.addonCosts.find(a => a.addonId === 'satelliteDataAPI');
  if (solcastAddon && solcastAddon.cost > 0) {
    const solcastSiteCount = selectedAddons.find(a => a.id === 'satelliteDataAPI')?.quantity || 0;
    solcastBreakdown = generateSolcastBreakdown(
      billingFrequency,
      solcastSiteCount,
      solcastAddon.pricePerUnit || 0,
      invoiceDate,
      periodStart,
      periodEnd
    );
    solcastTotal = solcastAddon.cost;
  }

  // Generate other addons breakdown (excluding Solcast/Satellite Data API)
  const addonsBreakdown = calculationResult.addonCosts
    .filter(addon => addon.cost > 0 && addon.addonId !== 'satelliteDataAPI')
    .map(addon => ({
      addonId: addon.addonId,
      addonName: addon.addonName,
      quantity: addon.quantity,
      pricePerUnit: addon.pricePerUnit,
      totalCost: addon.cost
    }));
  const addonsTotal = addonsBreakdown.reduce((sum, a) => sum + a.totalCost, 0);

  // Generate retainer breakdown if applicable
  let retainerBreakdown: SupportDocumentData['retainerBreakdown'];
  if (calculationResult.retainerCost > 0) {
    retainerBreakdown = {
      hours: 0, // Will be passed from params
      hourlyRate: 0,
      minimumValue: 0,
      calculatedCost: calculationResult.retainerCalculatedCost,
      totalCost: calculationResult.retainerCost,
      minimumApplied: calculationResult.retainerMinimumApplied
    };
  }

  // Calculate total including all addon costs and validate
  // Asset breakdown is annual - multiply by frequency multiplier for period comparison
  const frequencyMultiplier = getFrequencyMultiplier(billingFrequency);
  const assetBreakdownPeriodTotal = assetBreakdownTotal * frequencyMultiplier;
  
  const totalAddonCosts = calculationResult.addonCosts.reduce((sum, addon) => sum + addon.cost, 0);
  const calculatedTotal = assetBreakdownPeriodTotal + 
    calculationResult.minimumCharges + 
    calculationResult.minimumContractAdjustment +
    calculationResult.basePricingCost +
    calculationResult.retainerCost +
    totalAddonCosts;
  
  const invoiceTotal = calculationResult.totalPrice;
  const totalsMatch = Math.abs(calculatedTotal - invoiceTotal) < 0.01;

  return {
    customerName,
    currency,
    invoiceDate,
    invoicePeriod: calculationResult.invoicePeriod || format(invoiceDate, 'MMM yyyy'),
    discountPercent,
    yearInvoices: invoicesByPeriod,
    yearTotal,
    assetBreakdown,
    assetBreakdownTotal,
    solcastBreakdown,
    solcastTotal,
    addonsBreakdown,
    addonsTotal,
    retainerBreakdown,
    calculatedTotal,
    invoiceTotal,
    totalsMatch
  };
}

/**
 * Group invoices by billing period
 */
function groupInvoicesByPeriod(
  invoices: any[],
  billingFrequency: string
): SupportDocumentData['yearInvoices'] {
  const grouped: { [key: string]: any } = {};

  invoices.forEach(invoice => {
    const date = new Date(invoice.invoice_date);
    let period: string;

    if (billingFrequency === 'quarterly') {
      const quarter = Math.floor(date.getMonth() / 3) + 1;
      period = `Q${quarter}/${date.getFullYear()}`;
    } else if (billingFrequency === 'monthly') {
      period = format(date, 'MMM yyyy');
    } else if (billingFrequency === 'biannual') {
      const half = date.getMonth() < 6 ? 'H1' : 'H2';
      period = `${half}/${date.getFullYear()}`;
    } else {
      period = date.getFullYear().toString();
    }

    if (!grouped[period]) {
      grouped[period] = {
        period,
        monitoringFee: 0,
        solcastFee: 0,
        additionalWork: 0,
        total: 0
      };
    }

    // Parse addon data to separate Satellite Data API (solcast)
    const addonsData = invoice.addons_data as any[] || [];
    const solcastAddon = addonsData.find((a: any) => a.addonId === 'satelliteDataAPI');
    const solcastFee = solcastAddon?.cost || 0;

    grouped[period].monitoringFee += Number(invoice.invoice_amount) - solcastFee;
    grouped[period].solcastFee += solcastFee;
    grouped[period].total += Number(invoice.invoice_amount);
  });

  return Object.values(grouped);
}

/**
 * Generate asset breakdown with per-asset pricing
 */
function generateAssetBreakdown(
  assets: any[],
  calculationResult: CalculationResult,
  selectedModules: string[],
  selectedAddons: Array<{ id: string }>,
  packageType: string
): SupportDocumentData['assetBreakdown'] {
  
  // Calculate total MW for rate calculation
  const totalMW = assets.reduce((sum, asset) => sum + (asset.totalMW || 0), 0);
  
  // Determine per-kWp rate based on package and modules
  let baseRatePerMWp = 0;
  
  if (packageType === 'hybrid_tiered') {
    // For hybrid tiered, we need to use the breakdown rates
    const breakdown = calculationResult.hybridTieredBreakdown;
    if (breakdown) {
      baseRatePerMWp = breakdown.ongrid.mw > 0 
        ? breakdown.ongrid.rate 
        : breakdown.hybrid.rate;
    }
  } else if (packageType === 'pro' || packageType === 'custom') {
    // Sum up module rates
    baseRatePerMWp = calculationResult.moduleCosts.reduce((sum, m) => sum + m.rate, 0);
  } else if (packageType === 'starter') {
    // Distribute starter cost across all MW
    baseRatePerMWp = totalMW > 0 ? calculationResult.starterPackageCost / totalMW : 0;
  } else if (packageType === 'capped') {
    // Capped packages have a fixed fee, distribute proportionally
    baseRatePerMWp = totalMW > 0 ? calculationResult.starterPackageCost / totalMW : 0;
  }

  return assets.map(asset => {
    const pvCapacityKWp = (asset.totalMW || 0) * 1000;
    const isHybrid = asset.isHybrid || false;
    const isPV = !isHybrid;

    // Determine rate for this specific asset
    let assetRate = baseRatePerMWp;
    if (packageType === 'hybrid_tiered' && calculationResult.hybridTieredBreakdown) {
      assetRate = isHybrid 
        ? calculationResult.hybridTieredBreakdown.hybrid.rate 
        : calculationResult.hybridTieredBreakdown.ongrid.rate;
    }

    const pricePerKWp = assetRate / 1000; // Convert from per-MWp to per-kWp
    const pricePerYear = pvCapacityKWp * pricePerKWp;

    return {
      assetId: asset.assetId,
      assetName: asset.assetName,
      pvCapacityKWp: Math.round(pvCapacityKWp * 100) / 100,
      isPV,
      isHybrid,
      hubActive: selectedModules.includes('energySavingsHub'),
      portalActive: selectedModules.includes('stakeholderPortal'),
      controlActive: selectedModules.includes('control'),
      reportingActive: selectedAddons.some(a => a.id === 'reporting'),
      pricePerKWp: Math.round(pricePerKWp * 100) / 100,
      pricePerYear: Math.round(pricePerYear * 100) / 100
    };
  });
}

/**
 * Generate Solcast breakdown by month
 */
function generateSolcastBreakdown(
  billingFrequency: string,
  siteCount: number,
  pricePerSite: number,
  invoiceDate: Date,
  periodStart?: string,
  periodEnd?: string
): SupportDocumentData['solcastBreakdown'] {
  const months = getMonthsForPeriod(billingFrequency, invoiceDate, periodStart, periodEnd);
  
  return months.map(month => ({
    month,
    siteCount,
    pricePerSite: Math.round(pricePerSite * 100) / 100,
    totalPerMonth: Math.round(siteCount * pricePerSite * 100) / 100
  }));
}

/**
 * Get list of months for the billing period
 */
function getMonthsForPeriod(
  billingFrequency: string, 
  invoiceDate: Date,
  periodStart?: string,
  periodEnd?: string
): string[] {
  const months: string[] = [];
  
  // If we have period dates from contract, use them directly
  if (periodStart && periodEnd) {
    // Parse dates as local to avoid timezone shifts
    // Extract YYYY-MM-DD portion to create local dates
    const startStr = periodStart.split('T')[0] || periodStart.substring(0, 10);
    const endStr = periodEnd.split('T')[0] || periodEnd.substring(0, 10);
    
    // Create dates as local (not UTC) by parsing YYYY-MM-DD format
    const [startYear, startMonth, startDay] = startStr.split('-').map(Number);
    const [endYear, endMonth, endDay] = endStr.split('-').map(Number);
    
    const start = new Date(startYear, startMonth - 1, startDay);
    const end = new Date(endYear, endMonth - 1, endDay);
    
    // Generate months from period start to period end
    let current = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonthDate = new Date(end.getFullYear(), end.getMonth(), 1);
    
    while (current <= endMonthDate) {
      months.push(format(current, 'MMM yyyy'));
      current.setMonth(current.getMonth() + 1);
    }
    
    return months;
  }
  
  // Fallback: calculate based on billing frequency
  const startMonth = invoiceDate.getMonth();
  const year = invoiceDate.getFullYear();

  let monthCount = 1;
  if (billingFrequency === 'quarterly') monthCount = 3;
  else if (billingFrequency === 'biannual') monthCount = 6;
  else if (billingFrequency === 'annual') monthCount = 12;

  for (let i = 0; i < monthCount; i++) {
    const date = new Date(year, startMonth + i, 1);
    months.push(format(date, 'MMM yyyy'));
  }

  return months;
}

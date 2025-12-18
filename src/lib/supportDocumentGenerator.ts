import { supabase } from "@/integrations/supabase/client";
import { CalculationResult, getFrequencyMultiplier } from "./invoiceCalculations";
import { format, startOfYear, endOfYear } from "date-fns";

export interface SupportDocumentData {
  // Header info
  customerName: string;
  contractName?: string;
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
    // Elum ePM specific fields
    isSmallSite?: boolean;
    usesMinimum?: boolean;
    // Site minimum pricing fields
    calculatedCost?: number;
    minimumCharge?: number;
  }[];
  
  // Site minimum pricing summary (for pro/custom with minimum charges)
  siteMinimumPricingSummary?: {
    sitesOnNormal: number;
    sitesOnMinimum: number;
    normalPricingTotal: number;
    minimumPricingTotal: number;
  };
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
  
  // Elum-specific breakdowns
  elumEpmBreakdown?: {
    threshold: number;
    smallSitesCount: number;
    largeSitesCount: number;
    smallSitesTotal: number;
    largeSitesTotal: number;
    sitesUsingMinimum: number;
    belowThresholdRate: number;
    aboveThresholdRate: number;
  };
  elumJubailiBreakdown?: {
    perSiteFee: number;
    siteCount: number;
    totalCost: number;
  };
  elumInternalBreakdown?: {
    tiers: {
      label: string;
      mwInTier: number;
      pricePerMW: number;
      cost: number;
    }[];
    totalMW: number;
    totalCost: number;
  };
  
  // Discounted assets breakdown
  discountedAssetsBreakdown?: {
    assetId: string;
    assetName: string;
    mw: number;
    pricingType: 'annual' | 'per_mw';
    rate: number;
    cost: number;
    note?: string;
  }[];
  discountedAssetsTotal?: number;
  
  // Validation
  calculatedTotal: number;
  invoiceTotal: number;
  minimumContractAdjustment: number;
  minimumAnnualValue?: number; // The minimum annual contract value
  totalsMatch: boolean;
  // Detailed breakdown for validation
  calculationBreakdown: {
    assetBreakdownPeriod: number;
    minimumCharges: number;
    minimumContractAdjustment: number;
    baseMonthlyPrice: number;
    retainerCost: number;
    addonsTotal: number;
    discountedAssetsTotal: number;
  };
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
  periodEnd?: string,
  contractId?: string,
  retainerHours?: number,
  retainerHourlyRate?: number,
  retainerMinimumValue?: number,
  contractName?: string,
  minimumAnnualValue?: number
): Promise<SupportDocumentData> {
  
  // Fetch year-to-date invoices filtered by contract if available
  const yearStart = startOfYear(invoiceDate);
  const yearEnd = endOfYear(invoiceDate);
  
  let query = supabase
    .from('invoices')
    .select('*')
    .eq('customer_id', customerId)
    .gte('invoice_date', yearStart.toISOString())
    .lte('invoice_date', yearEnd.toISOString())
    .order('invoice_date', { ascending: true });
  
  // Filter by contract_id if provided (Fix #3)
  if (contractId) {
    query = query.eq('contract_id', contractId);
  }
  
  const { data: yearInvoices, error } = await query;

  if (error) {
    console.error('Error fetching year invoices:', error);
  }

  // Group invoices by period
  const invoicesByPeriod = groupInvoicesByPeriod(yearInvoices || [], billingFrequency);
  const yearTotal = (yearInvoices || []).reduce((sum, inv) => sum + Number(inv.invoice_amount), 0);

  // Generate asset breakdown based on package type (Fix #1)
  const frequencyMultiplier = getFrequencyMultiplier(billingFrequency);
  const { assetBreakdown, siteMinimumPricingSummary } = generateAssetBreakdown(
    ammpCapabilities?.assetBreakdown || [],
    calculationResult,
    selectedModules,
    selectedAddons,
    packageType,
    frequencyMultiplier
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
      periodEnd,
      ammpCapabilities?.assetBreakdown // Pass asset breakdown for pro-rata calculation
    );
    // Sum actual pro-rata monthly totals instead of using flat addon cost
    solcastTotal = solcastBreakdown 
      ? solcastBreakdown.reduce((sum, month) => sum + month.totalPerMonth, 0)
      : 0;
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

  // Generate retainer breakdown if applicable (Fix #5 - use passed params)
  let retainerBreakdown: SupportDocumentData['retainerBreakdown'];
  if (calculationResult.retainerCost > 0) {
    retainerBreakdown = {
      hours: retainerHours || 0,
      hourlyRate: retainerHourlyRate || 0,
      minimumValue: retainerMinimumValue || 0,
      calculatedCost: calculationResult.retainerCalculatedCost,
      totalCost: calculationResult.retainerCost,
      minimumApplied: calculationResult.retainerMinimumApplied
    };
  }

  // Generate Elum-specific breakdowns (Fix #1)
  let elumEpmBreakdown: SupportDocumentData['elumEpmBreakdown'];
  let elumJubailiBreakdown: SupportDocumentData['elumJubailiBreakdown'];
  let elumInternalBreakdown: SupportDocumentData['elumInternalBreakdown'];

  if (calculationResult.elumEpmBreakdown) {
    const epmBreak = calculationResult.elumEpmBreakdown;
    elumEpmBreakdown = {
      threshold: epmBreak.threshold,
      smallSitesCount: epmBreak.smallSites.length,
      largeSitesCount: epmBreak.largeSites.length,
      smallSitesTotal: epmBreak.smallSitesTotal,
      largeSitesTotal: epmBreak.largeSitesTotal,
      sitesUsingMinimum: epmBreak.sitesUsingMinimum || 0,
      belowThresholdRate: epmBreak.smallSites[0]?.pricePerMWp || 0,
      aboveThresholdRate: epmBreak.largeSites[0]?.pricePerMWp || 0
    };
  }

  if (calculationResult.elumJubailiBreakdown) {
    const jubBreak = calculationResult.elumJubailiBreakdown;
    elumJubailiBreakdown = {
      perSiteFee: jubBreak.perSiteFee,
      siteCount: jubBreak.siteCount,
      totalCost: jubBreak.totalCost
    };
  }

  if (calculationResult.elumInternalBreakdown) {
    const intBreak = calculationResult.elumInternalBreakdown;
    elumInternalBreakdown = {
      tiers: intBreak.tiers.map(t => ({
        label: t.label,
        mwInTier: t.mwInTier,
        pricePerMW: t.pricePerMW,
        cost: t.cost
      })),
      totalMW: intBreak.totalMW,
      totalCost: intBreak.totalCost
    };
  }

  // Generate discounted assets breakdown if applicable
  let discountedAssetsBreakdown: SupportDocumentData['discountedAssetsBreakdown'];
  let discountedAssetsTotal = 0;
  
  if (calculationResult.discountedAssets && calculationResult.discountedAssets.length > 0) {
    discountedAssetsBreakdown = calculationResult.discountedAssets.map(asset => ({
      assetId: asset.assetId,
      assetName: asset.assetName,
      mw: asset.mw,
      pricingType: asset.pricingType,
      rate: asset.rate,
      cost: asset.cost,
      note: asset.note
    }));
    discountedAssetsTotal = calculationResult.discountedAssetsTotal || 0;
  }

  // Calculate total including all addon costs and validate
  const totalAddonCosts = calculationResult.addonCosts.reduce((sum, addon) => sum + addon.cost, 0);
  const minimumContractAdjustment = calculationResult.minimumContractAdjustment || 0;
  
  let assetBreakdownPeriodTotal: number;
  let minimumChargesForBreakdown: number;
  
  // When site minimum pricing is active, use the period-adjusted values directly from calculation
  // This avoids double-applying the frequency multiplier
  if (siteMinimumPricingSummary && calculationResult.siteMinimumPricingBreakdown) {
    // These values are already period-adjusted from calculateInvoice
    assetBreakdownPeriodTotal = calculationResult.siteMinimumPricingBreakdown.normalPricingTotal + 
                                 calculationResult.siteMinimumPricingBreakdown.minimumPricingTotal;
    // Don't add minimumCharges separately - it's already included in minimumPricingTotal
    minimumChargesForBreakdown = 0;
  } else {
    // For other packages, multiply annual asset breakdown by frequency
    assetBreakdownPeriodTotal = assetBreakdownTotal * frequencyMultiplier;
    minimumChargesForBreakdown = calculationResult.minimumCharges;
  }
  
  const calculatedTotal = assetBreakdownPeriodTotal + 
    minimumChargesForBreakdown + 
    minimumContractAdjustment +
    calculationResult.basePricingCost +
    calculationResult.retainerCost +
    discountedAssetsTotal +
    totalAddonCosts;
  
  const invoiceTotal = calculationResult.totalPrice;
  const totalsMatch = Math.abs(calculatedTotal - invoiceTotal) < 0.01;

  return {
    customerName,
    contractName,
    currency,
    invoiceDate,
    invoicePeriod: calculationResult.invoicePeriod || format(invoiceDate, 'MMM yyyy'),
    discountPercent,
    yearInvoices: invoicesByPeriod,
    yearTotal,
    assetBreakdown,
    assetBreakdownTotal,
    siteMinimumPricingSummary,
    solcastBreakdown,
    solcastTotal,
    addonsBreakdown,
    addonsTotal,
    retainerBreakdown,
    elumEpmBreakdown,
    elumJubailiBreakdown,
    elumInternalBreakdown,
    discountedAssetsBreakdown,
    discountedAssetsTotal,
    calculatedTotal,
    invoiceTotal,
    minimumContractAdjustment,
    minimumAnnualValue, // Pass through the minimum annual value from contract
    totalsMatch,
    calculationBreakdown: {
      assetBreakdownPeriod: assetBreakdownPeriodTotal,
      minimumCharges: minimumChargesForBreakdown,
      minimumContractAdjustment,
      baseMonthlyPrice: calculationResult.basePricingCost,
      retainerCost: calculationResult.retainerCost,
      addonsTotal: totalAddonCosts,
      discountedAssetsTotal
    }
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
    // Fix: Check both 'addonId' and 'id' field names
    const addonsData = invoice.addons_data as any[] || [];
    const solcastAddon = addonsData.find((a: any) => 
      a.addonId === 'satelliteDataAPI' || a.id === 'satelliteDataAPI'
    );
    
    // Calculate Solcast fee from stored data
    let solcastFee = 0;
    if (solcastAddon) {
      if (solcastAddon.cost !== undefined && solcastAddon.cost > 0) {
        solcastFee = solcastAddon.cost;
      } else if (solcastAddon.calculatedTieredPrice?.totalPrice) {
        // For stored invoices, the cost might be in tiered price format
        // Need to multiply by period months for stored invoices
        const periodMonths = billingFrequency === 'quarterly' ? 3 
          : billingFrequency === 'biannual' ? 6 
          : billingFrequency === 'annual' ? 12 
          : 1;
        solcastFee = solcastAddon.calculatedTieredPrice.totalPrice * periodMonths;
      }
    }

    grouped[period].monitoringFee += Number(invoice.invoice_amount) - solcastFee;
    grouped[period].solcastFee += solcastFee;
    grouped[period].total += Number(invoice.invoice_amount);
  });

  return Object.values(grouped);
}

/**
 * Generate asset breakdown with per-asset pricing
 * Supports all package types including Elum packages (Fix #1)
 */
function generateAssetBreakdown(
  assets: any[],
  calculationResult: CalculationResult,
  selectedModules: string[],
  selectedAddons: Array<{ id: string }>,
  packageType: string,
  frequencyMultiplier: number = 1
): { 
  assetBreakdown: SupportDocumentData['assetBreakdown']; 
  siteMinimumPricingSummary?: SupportDocumentData['siteMinimumPricingSummary'];
} {
  
  // For Elum ePM - use the elumEpmBreakdown data
  // Convert period-adjusted costs back to annual for display with "/y" label
  if (packageType === 'elum_epm' && calculationResult.elumEpmBreakdown) {
    const epmBreak = calculationResult.elumEpmBreakdown;
    const allSites = [...epmBreak.smallSites, ...epmBreak.largeSites];
    
    return {
      assetBreakdown: allSites.map(site => ({
        assetId: site.assetId,
        assetName: site.assetName,
        pvCapacityKWp: site.capacityKwp,
        isPV: !site.isSmallSite,
        isHybrid: false,
        hubActive: false,
        portalActive: false,
        controlActive: false,
        reportingActive: false,
        pricePerKWp: site.pricePerMWp / 1000,
        pricePerYear: site.cost / frequencyMultiplier, // Convert to annual
        isSmallSite: site.isSmallSite,
        usesMinimum: site.usesMinimum,
        calculatedCost: site.calculatedCost ? site.calculatedCost / frequencyMultiplier : undefined,
        minimumCharge: site.usesMinimum ? site.cost / frequencyMultiplier : undefined
      }))
    };
  }
  
  // For Elum Jubaili - use flat per-site fee
  if (packageType === 'elum_jubaili' && calculationResult.elumJubailiBreakdown) {
    const jubBreak = calculationResult.elumJubailiBreakdown;
    
    return {
      assetBreakdown: jubBreak.sites.map(site => ({
        assetId: site.assetId,
        assetName: site.assetName,
        pvCapacityKWp: 0,
        isPV: true,
        isHybrid: false,
        hubActive: false,
        portalActive: false,
        controlActive: false,
        reportingActive: false,
        pricePerKWp: 0,
        pricePerYear: jubBreak.perSiteFee
      }))
    };
  }
  
  // For Elum Internal - don't show per-asset, use tier summary
  if (packageType === 'elum_internal' && calculationResult.elumInternalBreakdown) {
    return { assetBreakdown: [] };
  }
  
  // For pro/custom packages WITH site minimum pricing - use the breakdown data
  // Convert period-adjusted costs back to annual for display with "/y" label
  if ((packageType === 'pro' || packageType === 'custom') && calculationResult.siteMinimumPricingBreakdown) {
    const smpBreakdown = calculationResult.siteMinimumPricingBreakdown;
    const assetBreakdown: SupportDocumentData['assetBreakdown'] = [];
    
    // Calculate the per-kWp rate from the contract's module costs
    const baseRatePerMWp = calculationResult.moduleCosts.reduce((sum, m) => sum + m.rate, 0);
    const perKWpRate = baseRatePerMWp / 1000; // Convert from per-MWp to per-kWp
    
    // Sites on normal pricing (above threshold)
    for (const site of smpBreakdown.sitesAboveThreshold) {
      assetBreakdown.push({
        assetId: site.assetId,
        assetName: site.assetName,
        pvCapacityKWp: Math.round(site.mw * 1000 * 100) / 100,
        isPV: true,
        isHybrid: false,
        hubActive: selectedModules.includes('energySavingsHub'),
        portalActive: selectedModules.includes('stakeholderPortal'),
        controlActive: selectedModules.includes('control'),
        reportingActive: selectedAddons.some(a => a.id === 'reporting'),
        pricePerKWp: perKWpRate, // Contract's actual per-kWp rate
        pricePerYear: site.calculatedCost / frequencyMultiplier, // Convert to annual
        usesMinimum: false,
        calculatedCost: site.calculatedCost / frequencyMultiplier
      });
    }
    
    // Sites on minimum pricing (below threshold)
    for (const site of smpBreakdown.sitesBelowThreshold) {
      assetBreakdown.push({
        assetId: site.assetId,
        assetName: site.assetName,
        pvCapacityKWp: Math.round(site.mw * 1000 * 100) / 100,
        isPV: true,
        isHybrid: false,
        hubActive: selectedModules.includes('energySavingsHub'),
        portalActive: selectedModules.includes('stakeholderPortal'),
        controlActive: selectedModules.includes('control'),
        reportingActive: selectedAddons.some(a => a.id === 'reporting'),
        pricePerKWp: 0,
        pricePerYear: site.minimumCharge / frequencyMultiplier, // Convert to annual
        usesMinimum: true,
        calculatedCost: site.calculatedCost / frequencyMultiplier,
        minimumCharge: site.minimumCharge / frequencyMultiplier
      });
    }
    
    return {
      assetBreakdown,
      siteMinimumPricingSummary: {
        sitesOnNormal: smpBreakdown.sitesAboveThreshold.length,
        sitesOnMinimum: smpBreakdown.sitesBelowThreshold.length,
        normalPricingTotal: smpBreakdown.normalPricingTotal / frequencyMultiplier, // Convert to annual
        minimumPricingTotal: smpBreakdown.minimumPricingTotal / frequencyMultiplier // Convert to annual
      }
    };
  }
  
  // For Elum Portfolio OS - treat like pro/custom
  if (packageType === 'elum_portfolio_os') {
    const totalMW = assets.reduce((sum, asset) => sum + (asset.totalMW || 0), 0);
    const baseRatePerMWp = calculationResult.moduleCosts.reduce((sum, m) => sum + m.rate, 0);
    
    return {
      assetBreakdown: assets.map(asset => {
        const pvCapacityKWp = (asset.totalMW || 0) * 1000;
        const pricePerKWp = baseRatePerMWp / 1000;
        const pricePerYear = pvCapacityKWp * pricePerKWp;
        
        return {
          assetId: asset.assetId,
          assetName: asset.assetName,
          pvCapacityKWp: Math.round(pvCapacityKWp * 100) / 100,
          isPV: !asset.isHybrid,
          isHybrid: asset.isHybrid || false,
          hubActive: selectedModules.includes('energySavingsHub'),
          portalActive: selectedModules.includes('stakeholderPortal'),
          controlActive: selectedModules.includes('control'),
          reportingActive: selectedAddons.some(a => a.id === 'reporting'),
          pricePerKWp: Math.round(pricePerKWp * 100) / 100,
          pricePerYear: Math.round(pricePerYear * 100) / 100
        };
      })
    };
  }
  
  // Default logic for other package types
  const totalMW = assets.reduce((sum, asset) => sum + (asset.totalMW || 0), 0);
  
  let baseRatePerMWp = 0;
  
  if (packageType === 'hybrid_tiered') {
    const breakdown = calculationResult.hybridTieredBreakdown;
    if (breakdown) {
      baseRatePerMWp = breakdown.ongrid.mw > 0 
        ? breakdown.ongrid.rate 
        : breakdown.hybrid.rate;
    }
  } else if (packageType === 'pro' || packageType === 'custom') {
    baseRatePerMWp = calculationResult.moduleCosts.reduce((sum, m) => sum + m.rate, 0);
  } else if (packageType === 'starter') {
    baseRatePerMWp = totalMW > 0 ? calculationResult.starterPackageCost / totalMW : 0;
  } else if (packageType === 'capped') {
    baseRatePerMWp = totalMW > 0 ? calculationResult.starterPackageCost / totalMW : 0;
  }

  return {
    assetBreakdown: assets.map(asset => {
      const pvCapacityKWp = (asset.totalMW || 0) * 1000;
      const isHybrid = asset.isHybrid || false;
      const isPV = !isHybrid;

      let assetRate = baseRatePerMWp;
      if (packageType === 'hybrid_tiered' && calculationResult.hybridTieredBreakdown) {
        assetRate = isHybrid 
          ? calculationResult.hybridTieredBreakdown.hybrid.rate 
          : calculationResult.hybridTieredBreakdown.ongrid.rate;
      }

      const pricePerKWp = assetRate / 1000;
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
    })
  };
}

/**
 * Generate Solcast breakdown by month with pro-rata calculation based on SOLCAST DEVICE onboarding dates
 * Bug #1: Uses solcastOnboardingDate (satellite device created date) NOT asset onboardingDate
 */
function generateSolcastBreakdown(
  billingFrequency: string,
  totalSiteCount: number,
  pricePerSite: number,
  invoiceDate: Date,
  periodStart?: string,
  periodEnd?: string,
  assetBreakdown?: any[] // Pass asset data with solcastOnboardingDate and hasSolcast
): SupportDocumentData['solcastBreakdown'] {
  const months = getMonthsForPeriod(billingFrequency, invoiceDate, periodStart, periodEnd);
  
  // If no asset breakdown, fall back to current behavior (snapshot count for all months)
  if (!assetBreakdown || assetBreakdown.length === 0) {
    return months.map(month => ({
      month,
      siteCount: totalSiteCount,
      pricePerSite: Math.round(pricePerSite * 100) / 100,
      totalPerMonth: Math.round(totalSiteCount * pricePerSite * 100) / 100
    }));
  }
  
  // Filter to only Solcast-enabled sites
  const solcastAssets = assetBreakdown.filter(a => a.hasSolcast);
  
  return months.map(month => {
    // Parse month string to get end of that month (e.g., "Nov 2024")
    const monthParts = month.split(' ');
    const monthName = monthParts[0];
    const year = parseInt(monthParts[1]);
    const monthDate = new Date(`${monthName} 1, ${year}`);
    const monthIndex = monthDate.getMonth();
    const endOfMonth = new Date(year, monthIndex + 1, 0); // Last day of month
    
    // Count sites where the Solcast/satellite device was created on or before the end of this month
    // Bug #1 fix: Use solcastOnboardingDate (device created date), not asset onboardingDate
    const siteCountForMonth = solcastAssets.filter(asset => {
      // Use solcastOnboardingDate if available, otherwise fall back to onboardingDate
      const deviceDate = asset.solcastOnboardingDate || asset.onboardingDate;
      if (!deviceDate) return true; // If no date, assume always existed
      const onboardDate = new Date(deviceDate);
      return onboardDate <= endOfMonth;
    }).length;
    
    return {
      month,
      siteCount: siteCountForMonth,
      pricePerSite: Math.round(pricePerSite * 100) / 100,
      totalPerMonth: Math.round(siteCountForMonth * pricePerSite * 100) / 100
    };
  });
}

/**
 * Get list of months for the billing period (Fix #2)
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
  
  // Fallback: calculate BACKWARDS from invoice date (Fix #2)
  // For quarterly invoice on Dec 31, should be Oct, Nov, Dec - not Dec, Jan, Feb
  const invoiceMonth = invoiceDate.getMonth();
  const year = invoiceDate.getFullYear();

  let monthCount = 1;
  if (billingFrequency === 'quarterly') monthCount = 3;
  else if (billingFrequency === 'biannual') monthCount = 6;
  else if (billingFrequency === 'annual') monthCount = 12;

  // Calculate starting month by going backwards
  for (let i = monthCount - 1; i >= 0; i--) {
    const date = new Date(year, invoiceMonth - i, 1);
    months.push(format(date, 'MMM yyyy'));
  }

  return months;
}

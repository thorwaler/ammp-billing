// Shared invoice calculation logic
import { 
  MODULES, 
  ADDONS, 
  getAddonPrice, 
  calculateTieredPrice, 
  type ComplexityLevel, 
  type PricingTier,
  type DiscountTier,
  type MinimumChargeTier 
} from "@/data/pricingData";

export interface CalculationParams {
  packageType: string;
  totalMW: number;
  selectedModules: string[];
  selectedAddons: Array<{
    id: string;
    complexity?: ComplexityLevel;
    customPrice?: number;
    quantity?: number;
    customTiers?: PricingTier[];
  }>;
  customPricing?: {
    [key: string]: number;
  };
  minimumAnnualValue?: number;
  minimumCharge?: number;
  minimumChargeTiers?: MinimumChargeTier[];
  portfolioDiscountTiers?: DiscountTier[];
  sitesUnderThreshold?: number;
  frequencyMultiplier: number;
  billingFrequency?: string;
  ammpCapabilities?: {
    ongridTotalMW?: number;
    hybridTotalMW?: number;
  };
  assetBreakdown?: Array<{
    assetId: string;
    assetName: string;
    totalMW: number;
    isHybrid?: boolean;
  }>;
  enableSiteMinimumPricing?: boolean;
  baseMonthlyPrice?: number;
}

export interface SiteMinimumPricingResult {
  sitesAboveThreshold: {
    assetId: string;
    assetName: string;
    mw: number;
    calculatedCost: number;
    usesNormalPricing: true;
  }[];
  sitesBelowThreshold: {
    assetId: string;
    assetName: string;
    mw: number;
    calculatedCost: number;
    minimumCharge: number;
    usesMinimumPricing: true;
  }[];
  normalPricingTotal: number;
  minimumPricingTotal: number;
  totalSitesOnMinimum: number;
}

export interface CalculationResult {
  moduleCosts: {
    moduleId: string;
    moduleName: string;
    cost: number;
    rate: number;
    mw: number;
  }[];
  addonCosts: {
    addonId: string;
    addonName: string;
    cost: number;
    quantity?: number;
    tierApplied?: PricingTier | null;
    pricePerUnit?: number;
  }[];
  starterPackageCost: number;
  minimumCharges: number;
  totalMWCost: number;
  totalPrice: number;
  invoicePeriod?: string;
  hybridTieredBreakdown?: {
    ongrid: { mw: number; cost: number; rate: number };
    hybrid: { mw: number; cost: number; rate: number };
  };
  siteMinimumPricingBreakdown?: SiteMinimumPricingResult;
  minimumContractAdjustment: number;
  basePricingCost: number;
}

/**
 * Calculate site-level minimum pricing
 * Identifies sites where calculated cost is below minimum charge threshold
 */
export function calculateSiteMinimumPricing(
  assetBreakdown: Array<{
    assetId: string;
    assetName: string;
    totalMW: number;
    isHybrid?: boolean;
  }>,
  perMWpRate: number,
  totalPortfolioMW: number,
  minimumChargeTiers: MinimumChargeTier[],
  frequencyMultiplier: number
): SiteMinimumPricingResult {
  const applicableMinCharge = getApplicableMinimumCharge(totalPortfolioMW, minimumChargeTiers);
  
  const sitesAboveThreshold: SiteMinimumPricingResult['sitesAboveThreshold'] = [];
  const sitesBelowThreshold: SiteMinimumPricingResult['sitesBelowThreshold'] = [];
  
  for (const asset of assetBreakdown) {
    const normalCost = asset.totalMW * perMWpRate * frequencyMultiplier;
    const minimumCharge = applicableMinCharge * frequencyMultiplier;
    
    if (normalCost < minimumCharge) {
      sitesBelowThreshold.push({
        assetId: asset.assetId,
        assetName: asset.assetName,
        mw: asset.totalMW,
        calculatedCost: normalCost,
        minimumCharge,
        usesMinimumPricing: true
      });
    } else {
      sitesAboveThreshold.push({
        assetId: asset.assetId,
        assetName: asset.assetName,
        mw: asset.totalMW,
        calculatedCost: normalCost,
        usesNormalPricing: true
      });
    }
  }
  
  const normalPricingTotal = sitesAboveThreshold.reduce((sum, site) => sum + site.calculatedCost, 0);
  const minimumPricingTotal = sitesBelowThreshold.reduce((sum, site) => sum + site.minimumCharge, 0);
  
  return {
    sitesAboveThreshold,
    sitesBelowThreshold,
    normalPricingTotal,
    minimumPricingTotal,
    totalSitesOnMinimum: sitesBelowThreshold.length
  };
}

/**
 * Calculate module costs based on package type and selected modules
 */
export function calculateModuleCosts(params: CalculationParams): {
  moduleCosts: CalculationResult['moduleCosts'];
  totalMWCost: number;
} {
  const { packageType, totalMW, selectedModules, customPricing, frequencyMultiplier } = params;
  
  const moduleCosts = selectedModules.map(moduleId => {
    const module = MODULES.find(m => m.id === moduleId);
    if (!module) return null;
    
    // Use custom pricing if available
    let price = module.price;
    if (customPricing && customPricing[moduleId] !== undefined) {
      price = customPricing[moduleId];
    }
    
    return {
      moduleId: module.id,
      moduleName: module.name,
      cost: price * totalMW * frequencyMultiplier,
      rate: price,
      mw: totalMW
    };
  }).filter(Boolean) as CalculationResult['moduleCosts'];
  
  const totalMWCost = moduleCosts.reduce((sum, item) => sum + item.cost, 0);
  
  return { moduleCosts, totalMWCost };
}

/**
 * Calculate addon costs with tiered pricing support
 */
export function calculateAddonCosts(
  selectedAddons: CalculationParams['selectedAddons'],
  frequencyMultiplier: number,
  billingFrequency?: string
): CalculationResult['addonCosts'] {
  return selectedAddons.map(addon => {
    const addonDef = ADDONS.find(a => a.id === addon.id);
    if (!addonDef) return null;
    
    // Handle tiered pricing first
    if (addonDef.tieredPricing && addon.quantity) {
      const tierCalc = calculateTieredPrice(addonDef, addon.quantity, addon.customTiers);
      
      // Satellite Data API uses monthly pricing, multiply by period months
      // Other addons are one-off costs, no multiplication needed
      const priceMultiplier = addon.id === 'satelliteDataAPI' && billingFrequency
        ? getPeriodMonthsMultiplier(billingFrequency)
        : 1;
      
      return {
        addonId: addon.id,
        addonName: addonDef.name,
        cost: tierCalc.totalPrice * priceMultiplier,
        quantity: addon.quantity,
        tierApplied: tierCalc.appliedTier,
        pricePerUnit: tierCalc.pricePerUnit
      };
    }
    
    // Fallback to standard pricing (one-off costs, no frequency multiplication)
    const addonPrice = getAddonPrice(addonDef, addon.complexity, addon.customPrice);
    const quantity = addon.quantity || 1;
    
    return {
      addonId: addon.id,
      addonName: addonDef.name,
      cost: addonPrice * quantity,
      quantity
    };
  }).filter(Boolean) as CalculationResult['addonCosts'];
}

/**
 * Calculate minimum charges based on sites under threshold
 * Now supports both legacy minimumCharge and new tiered system
 */
export function calculateMinimumCharges(
  minimumCharge: number | undefined,
  sitesUnderThreshold: number | undefined,
  frequencyMultiplier: number,
  totalMW?: number,
  minimumChargeTiers?: MinimumChargeTier[]
): number {
  if (!sitesUnderThreshold) return 0;
  
  // Use tiered system if available
  if (minimumChargeTiers && minimumChargeTiers.length > 0 && totalMW !== undefined) {
    const applicableCharge = getApplicableMinimumCharge(totalMW, minimumChargeTiers);
    return applicableCharge * sitesUnderThreshold * frequencyMultiplier;
  }
  
  // Fallback to legacy system
  if (!minimumCharge) return 0;
  return minimumCharge * sitesUnderThreshold * frequencyMultiplier;
}

/**
 * Calculate hybrid tiered pricing breakdown
 */
export function calculateHybridTieredBreakdown(
  params: CalculationParams
): CalculationResult['hybridTieredBreakdown'] {
  const { customPricing, ammpCapabilities, totalMW, frequencyMultiplier } = params;
  
  const ongridPrice = customPricing?.ongrid_per_mwp || 0;
  const hybridPrice = customPricing?.hybrid_per_mwp || 0;
  
  if (ammpCapabilities?.ongridTotalMW !== undefined && ammpCapabilities?.hybridTotalMW !== undefined) {
    const ongridMW = ammpCapabilities.ongridTotalMW;
    const hybridMW = ammpCapabilities.hybridTotalMW;
    
    return {
      ongrid: { 
        mw: ongridMW, 
        cost: ongridMW * ongridPrice * frequencyMultiplier, 
        rate: ongridPrice 
      },
      hybrid: { 
        mw: hybridMW, 
        cost: hybridMW * hybridPrice * frequencyMultiplier, 
        rate: hybridPrice 
      }
    };
  }
  
  // Fallback if no AMMP data
  return {
    ongrid: { 
      mw: totalMW, 
      cost: totalMW * ongridPrice * frequencyMultiplier, 
      rate: ongridPrice 
    },
    hybrid: { 
      mw: 0, 
      cost: 0, 
      rate: hybridPrice 
    }
  };
}

/**
 * Main calculation function
 */
export function calculateInvoice(params: CalculationParams): CalculationResult {
  const {
    packageType,
    totalMW,
    minimumAnnualValue,
    frequencyMultiplier,
    minimumCharge,
    sitesUnderThreshold,
    selectedAddons
  } = params;
  
  const result: CalculationResult = {
    moduleCosts: [],
    addonCosts: [],
    starterPackageCost: 0,
    minimumCharges: 0,
    totalMWCost: 0,
    totalPrice: 0,
    minimumContractAdjustment: 0,
    basePricingCost: 0,
  };
  
  const periodMonths = getPeriodMonthsMultiplier(params.billingFrequency || 'annual');
  
  // Calculate base pricing (monthly × period months)
  result.basePricingCost = (params.baseMonthlyPrice || 0) * periodMonths;
  
  // Calculate based on package type
  if (packageType === 'starter') {
    // Starter package - flat fee
    const minimumValue = minimumAnnualValue || 3000;
    result.starterPackageCost = minimumValue * frequencyMultiplier;
  } else if (packageType === 'hybrid_tiered') {
    // Hybrid tiered - special per-MWp rates
    const breakdown = calculateHybridTieredBreakdown(params);
    result.hybridTieredBreakdown = breakdown;
    
    // Calculate module costs but EXCLUDE Technical Monitoring (already covered by hybrid pricing)
    const filteredModules = params.selectedModules.filter(
      moduleId => moduleId !== 'technicalMonitoring'
    );
    
    const { moduleCosts, totalMWCost } = calculateModuleCosts({
      ...params,
      selectedModules: filteredModules
    });
    result.moduleCosts = moduleCosts;
    
    result.totalMWCost = breakdown.ongrid.cost + breakdown.hybrid.cost + totalMWCost;
  } else if (packageType === 'capped') {
    // Capped package - fixed annual fee regardless of MW
    const minimumValue = minimumAnnualValue || 0;
    result.starterPackageCost = minimumValue * frequencyMultiplier;
  } else {
    // Pro or Custom - calculate module costs
    const { moduleCosts, totalMWCost } = calculateModuleCosts(params);
    result.moduleCosts = moduleCosts;
    result.totalMWCost = totalMWCost;
    
    // Apply site-level minimum pricing if enabled and data available
    if (params.enableSiteMinimumPricing && 
        params.assetBreakdown && 
        params.assetBreakdown.length > 0 &&
        params.minimumChargeTiers &&
        params.minimumChargeTiers.length > 0) {
      
      // Calculate per-MWp rate from selected modules
      const perMWpRate = params.selectedModules.reduce((sum, moduleId) => {
        const module = MODULES.find(m => m.id === moduleId);
        const price = params.customPricing?.[moduleId] ?? module?.price ?? 0;
        return sum + price;
      }, 0);
      
      // Calculate site minimum pricing breakdown
      const siteMinPricing = calculateSiteMinimumPricing(
        params.assetBreakdown,
        perMWpRate,
        totalMW,
        params.minimumChargeTiers,
        frequencyMultiplier
      );
      
      // Replace totalMWCost and minimumCharges with site-aware calculation
      result.totalMWCost = siteMinPricing.normalPricingTotal;
      result.minimumCharges = siteMinPricing.minimumPricingTotal;
      result.siteMinimumPricingBreakdown = siteMinPricing;
    }
  }
  
  // Calculate addon costs
  result.addonCosts = calculateAddonCosts(selectedAddons, frequencyMultiplier, params.billingFrequency);
  
  // Calculate minimum charges (with tier support) - only if not already set by site-level pricing
  if (!result.siteMinimumPricingBreakdown) {
    result.minimumCharges = calculateMinimumCharges(
      minimumCharge,
      sitesUnderThreshold,
      frequencyMultiplier,
      totalMW,
      params.minimumChargeTiers
    );
  }
  
  // Calculate base cost (modules + minimum charges, or package cost)
  let baseCost = result.starterPackageCost + result.totalMWCost + result.minimumCharges;
  
  // Apply minimum annual value to BASE COST only (for Pro and Custom packages)
  if ((packageType === 'pro' || packageType === 'custom') && minimumAnnualValue) {
    const minimumForPeriod = minimumAnnualValue * frequencyMultiplier;
    if (baseCost < minimumForPeriod) {
      // Add the difference as a "minimum contract value adjustment"
      const adjustment = minimumForPeriod - baseCost;
      result.minimumContractAdjustment = adjustment;
      baseCost = minimumForPeriod;
    }
  }
  
  // Calculate final total: base cost + addons + base pricing
  const addonTotal = result.addonCosts.reduce((sum, item) => sum + item.cost, 0);
  result.totalPrice = baseCost + addonTotal + result.basePricingCost;
  
  return result;
}

/**
 * Helper to calculate frequency multiplier
 */
export function getFrequencyMultiplier(frequency: string): number {
  switch (frequency) {
    case "monthly": return 1/12;
    case "quarterly": return 0.25;
    case "biannual": return 0.5;
    case "annual": return 1;
    default: return 1;
  }
}

/**
 * Helper to get number of months in billing period (for monthly-priced items like Satellite Data API)
 */
export function getPeriodMonthsMultiplier(frequency: string): number {
  switch (frequency) {
    case "monthly": return 1;
    case "quarterly": return 3;
    case "biannual": return 6;
    case "annual": return 12;
    default: return 1;
  }
}

/**
 * Helper to calculate proration multiplier for partial periods
 */
export function calculateProrationMultiplier(
  startDate: Date, 
  endDate: Date, 
  frequency: string
): number {
  const oneDay = 24 * 60 * 60 * 1000;
  const days = Math.round(Math.abs((endDate.getTime() - startDate.getTime()) / oneDay));
  
  const periodDays: { [key: string]: number } = {
    monthly: 30,
    quarterly: 91,
    biannual: 182,
    annual: 365
  };
  
  const standardDays = periodDays[frequency] || 365;
  return days / standardDays;
}

/**
 * Helper to get applicable discount based on MW and discount tiers
 */
export function getApplicableDiscount(
  totalMW: number,
  discountTiers?: DiscountTier[]
): number {
  if (!discountTiers || discountTiers.length === 0) return 0;
  
  const applicableTier = discountTiers.find(tier => 
    totalMW >= tier.minMW && 
    (tier.maxMW === null || totalMW <= tier.maxMW)
  );
  
  return applicableTier ? applicableTier.discountPercent : 0;
}

/**
 * Helper to get applicable minimum charge based on MW and minimum charge tiers
 */
export function getApplicableMinimumCharge(
  totalMW: number,
  minimumChargeTiers?: MinimumChargeTier[]
): number {
  if (!minimumChargeTiers || minimumChargeTiers.length === 0) return 0;
  
  const applicableTier = minimumChargeTiers.find(tier => 
    totalMW >= tier.minMW && 
    (tier.maxMW === null || totalMW <= tier.maxMW)
  );
  
  return applicableTier ? applicableTier.chargePerSite : 0;
}

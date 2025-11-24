// Shared invoice calculation logic
import { MODULES, ADDONS, getAddonPrice, calculateTieredPrice, type ComplexityLevel, type PricingTier } from "@/data/pricingData";

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
  sitesUnderThreshold?: number;
  frequencyMultiplier: number;
  billingFrequency?: string;
  ammpCapabilities?: {
    ongridTotalMW?: number;
    hybridTotalMW?: number;
  };
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
 */
export function calculateMinimumCharges(
  minimumCharge: number | undefined,
  sitesUnderThreshold: number | undefined,
  frequencyMultiplier: number
): number {
  if (!minimumCharge || !sitesUnderThreshold) return 0;
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
  };
  
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
    
    // Apply minimum for Pro package
    if (packageType === 'pro') {
      const proMinimum = minimumAnnualValue || 5000;
      if (totalMWCost < proMinimum * frequencyMultiplier) {
        result.totalMWCost = proMinimum * frequencyMultiplier;
      }
    }
  }
  
  // Calculate addon costs
  result.addonCosts = calculateAddonCosts(selectedAddons, frequencyMultiplier, params.billingFrequency);
  
  // Calculate minimum charges
  result.minimumCharges = calculateMinimumCharges(
    minimumCharge,
    sitesUnderThreshold,
    frequencyMultiplier
  );
  
  // Calculate total
  result.totalPrice = 
    result.starterPackageCost + 
    result.totalMWCost + 
    result.addonCosts.reduce((sum, item) => sum + item.cost, 0) +
    result.minimumCharges;
  
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

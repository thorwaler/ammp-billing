// Shared invoice calculation logic
import { MODULES, ADDONS, getAddonPrice, type ComplexityLevel } from "@/data/pricingData";

export interface CalculationParams {
  packageType: string;
  totalMW: number;
  selectedModules: string[];
  selectedAddons: Array<{
    id: string;
    complexity?: ComplexityLevel;
    customPrice?: number;
    quantity?: number;
  }>;
  customPricing?: {
    [key: string]: number;
  };
  minimumAnnualValue?: number;
  minimumCharge?: number;
  sitesUnderThreshold?: number;
  frequencyMultiplier: number;
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
  }[];
  addonCosts: {
    addonId: string;
    addonName: string;
    cost: number;
  }[];
  starterPackageCost: number;
  minimumCharges: number;
  totalMWCost: number;
  totalPrice: number;
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
      cost: price * totalMW * frequencyMultiplier
    };
  }).filter(Boolean) as CalculationResult['moduleCosts'];
  
  const totalMWCost = moduleCosts.reduce((sum, item) => sum + item.cost, 0);
  
  return { moduleCosts, totalMWCost };
}

/**
 * Calculate addon costs
 */
export function calculateAddonCosts(
  selectedAddons: CalculationParams['selectedAddons'],
  frequencyMultiplier: number
): CalculationResult['addonCosts'] {
  return selectedAddons.map(addon => {
    const addonDef = ADDONS.find(a => a.id === addon.id);
    if (!addonDef) return null;
    
    const addonPrice = getAddonPrice(addonDef, addon.complexity, addon.customPrice);
    const quantity = addon.quantity || 1;
    
    return {
      addonId: addon.id,
      addonName: addonDef.name,
      cost: addonPrice * quantity * frequencyMultiplier
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
    result.totalMWCost = breakdown.ongrid.cost + breakdown.hybrid.cost;
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
  result.addonCosts = calculateAddonCosts(selectedAddons, frequencyMultiplier);
  
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

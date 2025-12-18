// Shared invoice calculation logic
import { 
  MODULES, 
  ADDONS, 
  getAddonPrice, 
  calculateTieredPrice, 
  type ComplexityLevel, 
  type PricingTier,
  type DiscountTier,
  type MinimumChargeTier,
  type GraduatedMWTier
} from "@/data/pricingData";

// Custom asset discount pricing interface
export interface CustomAssetPricing {
  [assetId: string]: {
    pricingType: 'annual' | 'per_mw';
    price: number;
    note?: string;
  };
}

// Discounted asset result interface
export interface DiscountedAssetResult {
  assetId: string;
  assetName: string;
  mw: number;
  pricingType: 'annual' | 'per_mw';
  rate: number;
  cost: number;
  note?: string;
}

export interface SiteBillingItem {
  assetId: string;
  assetName: string;
  capacityKwp?: number;
  onboardingDate?: string;
  needsOnboarding: boolean;
  needsAnnualRenewal: boolean;
  onboardingFee?: number;
  annualFee?: number;
}

export interface PerSiteCalculationResult {
  onboardingCost: number;
  annualSubscriptionCost: number;
  sitesOnboarded: number;
  sitesRenewed: number;
  siteBreakdown: SiteBillingItem[];
}

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
    ongridMW?: number;
    hybridMW?: number;
  };
  assetBreakdown?: Array<{
    assetId: string;
    assetName: string;
    totalMW: number;
    isHybrid?: boolean;
  }>;
  enableSiteMinimumPricing?: boolean;
  baseMonthlyPrice?: number;
  siteChargeFrequency?: "monthly" | "annual";
  retainerHours?: number;
  retainerHourlyRate?: number;
  retainerMinimumValue?: number;
  // Per-site package fields
  onboardingFeePerSite?: number;
  annualFeePerSite?: number;
  sitesToBill?: SiteBillingItem[];
  // Elum package fields
  siteSizeThresholdKwp?: number;
  belowThresholdPricePerMWp?: number;
  aboveThresholdPricePerMWp?: number;
  // Elum Internal Assets package fields
  graduatedMWTiers?: GraduatedMWTier[];
  // Custom asset discount pricing
  customAssetPricing?: CustomAssetPricing;
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

export interface ElumEpmSiteBreakdown {
  assetId: string;
  assetName: string;
  capacityKwp: number;  // For display
  capacityMW: number;   // For calculation
  isSmallSite: boolean;
  pricePerMWp: number;  // Price per MWp
  cost: number;
  calculatedCost?: number;  // Original calculated cost before minimum applied
  usesMinimum?: boolean;    // Whether minimum fee was applied
}

export interface ElumEpmBreakdown {
  threshold: number;
  smallSites: ElumEpmSiteBreakdown[];
  largeSites: ElumEpmSiteBreakdown[];
  smallSitesTotal: number;
  largeSitesTotal: number;
  totalCost: number;
  sitesUsingMinimum?: number;  // Count of sites where minimum was applied
}

export interface ElumJubailiBreakdown {
  perSiteFee: number;
  siteCount: number;
  sites: Array<{ assetId: string; assetName: string }>;
  totalCost: number;
  appliedTier?: MinimumChargeTier;
  allTiers?: MinimumChargeTier[];
  totalMW?: number;
}

export interface ElumInternalTierBreakdown {
  label: string;
  minMW: number;
  maxMW: number | null;
  mwInTier: number;
  pricePerMW: number;
  cost: number;
}

export interface ElumInternalBreakdown {
  tiers: ElumInternalTierBreakdown[];
  totalMW: number;
  totalCost: number;
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
  retainerCost: number;
  retainerCalculatedCost: number;
  retainerMinimumApplied: boolean;
  // Per-site package results
  perSiteBreakdown?: PerSiteCalculationResult;
  // Elum package results
  elumEpmBreakdown?: ElumEpmBreakdown;
  elumJubailiBreakdown?: ElumJubailiBreakdown;
  elumInternalBreakdown?: ElumInternalBreakdown;
  // Discounted assets results
  discountedAssets?: DiscountedAssetResult[];
  discountedAssetsTotal?: number;
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
  frequencyMultiplier: number,
  siteChargeFrequency: "monthly" | "annual" = "annual",
  billingFrequency?: string
): SiteMinimumPricingResult {
  const applicableMinCharge = getApplicableMinimumCharge(totalPortfolioMW, minimumChargeTiers);
  
  // Calculate charge multiplier based on frequency
  let chargeMultiplier: number;
  if (siteChargeFrequency === "monthly") {
    // Monthly charges: multiply by number of months in billing period
    chargeMultiplier = getPeriodMonthsMultiplier(billingFrequency || "annual");
  } else {
    // Annual charges: use frequency multiplier
    chargeMultiplier = frequencyMultiplier;
  }
  
  const sitesAboveThreshold: SiteMinimumPricingResult['sitesAboveThreshold'] = [];
  const sitesBelowThreshold: SiteMinimumPricingResult['sitesBelowThreshold'] = [];
  
  for (const asset of assetBreakdown) {
    const normalCost = asset.totalMW * perMWpRate * frequencyMultiplier;
    const minimumCharge = applicableMinCharge * chargeMultiplier;
    
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
  minimumChargeTiers?: MinimumChargeTier[],
  siteChargeFrequency: "monthly" | "annual" = "annual",
  billingFrequency?: string
): number {
  if (!sitesUnderThreshold) return 0;
  
  // Calculate charge multiplier based on frequency
  let chargeMultiplier: number;
  if (siteChargeFrequency === "monthly") {
    // Monthly charges: multiply by number of months in billing period
    chargeMultiplier = getPeriodMonthsMultiplier(billingFrequency || "annual");
  } else {
    // Annual charges: use frequency multiplier
    chargeMultiplier = frequencyMultiplier;
  }
  
  // Use tiered system if available
  if (minimumChargeTiers && minimumChargeTiers.length > 0 && totalMW !== undefined) {
    const applicableCharge = getApplicableMinimumCharge(totalMW, minimumChargeTiers);
    return applicableCharge * sitesUnderThreshold * chargeMultiplier;
  }
  
  // Fallback to legacy system
  if (!minimumCharge) return 0;
  return minimumCharge * sitesUnderThreshold * chargeMultiplier;
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
  
  // Handle both field naming conventions (ongridTotalMW/hybridTotalMW and ongridMW/hybridMW)
  const ongridMW = ammpCapabilities?.ongridTotalMW ?? ammpCapabilities?.ongridMW ?? 0;
  const hybridMW = ammpCapabilities?.hybridTotalMW ?? ammpCapabilities?.hybridMW ?? 0;
  
  if (ongridMW > 0 || hybridMW > 0) {
    
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
 * Calculate Elum ePM site-size threshold pricing
 * Prices are per MWp (not per kWp), but threshold is still in kWp
 */
export function calculateElumEpmBreakdown(
  assetBreakdown: Array<{ assetId: string; assetName: string; totalMW: number }>,
  thresholdKwp: number,
  belowThresholdPricePerMWp: number,
  aboveThresholdPricePerMWp: number,
  frequencyMultiplier: number,
  minimumFeePerSite?: number  // Optional minimum fee per site (acts as floor)
): ElumEpmBreakdown {
  const smallSites: ElumEpmSiteBreakdown[] = [];
  const largeSites: ElumEpmSiteBreakdown[] = [];
  let sitesUsingMinimum = 0;
  
  for (const asset of assetBreakdown) {
    const capacityKwp = asset.totalMW * 1000; // Convert MW to kWp for threshold comparison
    const capacityMW = asset.totalMW;
    const isSmall = capacityKwp <= thresholdKwp;
    const pricePerMWp = isSmall ? belowThresholdPricePerMWp : aboveThresholdPricePerMWp;
    // Cost is calculated using MW (not kWp) since prices are per MWp
    const calculatedCost = capacityMW * pricePerMWp * frequencyMultiplier;
    
    // Apply minimum fee as floor if configured
    const minimumCost = (minimumFeePerSite || 0) * frequencyMultiplier;
    const usesMinimum = minimumFeePerSite && minimumFeePerSite > 0 && calculatedCost < minimumCost;
    const cost = usesMinimum ? minimumCost : calculatedCost;
    
    if (usesMinimum) {
      sitesUsingMinimum++;
    }
    
    const siteBreakdown: ElumEpmSiteBreakdown = {
      assetId: asset.assetId,
      assetName: asset.assetName,
      capacityKwp,
      capacityMW,
      isSmallSite: isSmall,
      pricePerMWp,
      cost,
      calculatedCost,
      usesMinimum: !!usesMinimum
    };
    
    if (isSmall) {
      smallSites.push(siteBreakdown);
    } else {
      largeSites.push(siteBreakdown);
    }
  }
  
  return {
    threshold: thresholdKwp,
    smallSites,
    largeSites,
    smallSitesTotal: smallSites.reduce((sum, s) => sum + s.cost, 0),
    largeSitesTotal: largeSites.reduce((sum, s) => sum + s.cost, 0),
    totalCost: smallSites.reduce((sum, s) => sum + s.cost, 0) + largeSites.reduce((sum, s) => sum + s.cost, 0),
    sitesUsingMinimum
  };
}

/**
 * Calculate Elum Jubaili per-site pricing with tiered support
 */
export function calculateElumJubailiBreakdown(
  assetBreakdown: Array<{ assetId: string; assetName: string; totalMW: number }>,
  fallbackPerSiteFee: number,
  frequencyMultiplier: number,
  totalMW?: number,
  minimumChargeTiers?: MinimumChargeTier[]
): ElumJubailiBreakdown {
  const siteCount = assetBreakdown.length;
  const calculatedTotalMW = totalMW ?? assetBreakdown.reduce((sum, a) => sum + a.totalMW, 0);
  
  // Use tiered pricing if available, otherwise fallback to flat fee
  let perSiteFee = fallbackPerSiteFee;
  let appliedTier: MinimumChargeTier | undefined;
  
  if (minimumChargeTiers && minimumChargeTiers.length > 0) {
    appliedTier = minimumChargeTiers.find(tier => 
      calculatedTotalMW >= tier.minMW && 
      (tier.maxMW === null || calculatedTotalMW <= tier.maxMW)
    );
    if (appliedTier) {
      perSiteFee = appliedTier.chargePerSite;
    }
  }
  
  const totalCost = siteCount * perSiteFee * frequencyMultiplier;
  
  return {
    perSiteFee,
    siteCount,
    sites: assetBreakdown.map(a => ({ assetId: a.assetId, assetName: a.assetName })),
    totalCost,
    appliedTier,
    allTiers: minimumChargeTiers,
    totalMW: calculatedTotalMW
  };
}

/**
 * Calculate Elum Internal Assets graduated MW pricing
 * Each tier applies to a specific MW range with its own price per MW
 */
export function calculateElumInternalBreakdown(
  totalMW: number,
  graduatedTiers: GraduatedMWTier[],
  frequencyMultiplier: number
): ElumInternalBreakdown {
  // Sort tiers by minMW
  const sortedTiers = [...graduatedTiers].sort((a, b) => a.minMW - b.minMW);
  
  let remainingMW = totalMW;
  const tierBreakdown: ElumInternalTierBreakdown[] = [];
  
  for (const tier of sortedTiers) {
    if (remainingMW <= 0) break;
    
    const tierStart = tier.minMW;
    const tierEnd = tier.maxMW ?? Infinity;
    const tierCapacity = tierEnd - tierStart;
    
    const mwInThisTier = Math.min(remainingMW, tierCapacity);
    const cost = mwInThisTier * tier.pricePerMW * frequencyMultiplier;
    
    tierBreakdown.push({
      label: tier.label,
      minMW: tier.minMW,
      maxMW: tier.maxMW,
      mwInTier: mwInThisTier,
      pricePerMW: tier.pricePerMW,
      cost
    });
    
    remainingMW -= mwInThisTier;
  }
  
  return {
    tiers: tierBreakdown,
    totalMW,
    totalCost: tierBreakdown.reduce((sum, t) => sum + t.cost, 0)
  };
}

/**
 * Calculate discounted assets total
 * Assets with custom pricing are excluded from normal calculations
 */
function calculateDiscountedAssets(
  customAssetPricing: CustomAssetPricing | undefined,
  assetBreakdown: Array<{ assetId: string; assetName: string; totalMW: number }> | undefined,
  frequencyMultiplier: number
): { discountedAssets: DiscountedAssetResult[]; discountedAssetsTotal: number } {
  if (!customAssetPricing || !assetBreakdown) {
    return { discountedAssets: [], discountedAssetsTotal: 0 };
  }
  
  const discountedAssets: DiscountedAssetResult[] = [];
  let discountedAssetsTotal = 0;
  
  for (const asset of assetBreakdown) {
    const customPricing = customAssetPricing[asset.assetId];
    if (customPricing) {
      const cost = customPricing.pricingType === 'annual'
        ? customPricing.price * frequencyMultiplier
        : customPricing.price * asset.totalMW * frequencyMultiplier;
      
      discountedAssets.push({
        assetId: asset.assetId,
        assetName: asset.assetName,
        mw: asset.totalMW,
        pricingType: customPricing.pricingType,
        rate: customPricing.price,
        cost,
        note: customPricing.note
      });
      
      discountedAssetsTotal += cost;
    }
  }
  
  return { discountedAssets, discountedAssetsTotal };
}

/**
 * Filter out discounted assets from asset breakdown
 */
function filterNonDiscountedAssets(
  assetBreakdown: Array<{ assetId: string; assetName: string; totalMW: number; isHybrid?: boolean }> | undefined,
  customAssetPricing: CustomAssetPricing | undefined
): Array<{ assetId: string; assetName: string; totalMW: number; isHybrid?: boolean }> {
  if (!assetBreakdown) return [];
  if (!customAssetPricing) return assetBreakdown;
  
  return assetBreakdown.filter(asset => !customAssetPricing[asset.assetId]);
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
    selectedAddons,
    customAssetPricing
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
    retainerCost: 0,
    retainerCalculatedCost: 0,
    retainerMinimumApplied: false,
  };
  
  const periodMonths = getPeriodMonthsMultiplier(params.billingFrequency || 'annual');
  
  // Calculate discounted assets first (these are excluded from normal calculations)
  const { discountedAssets, discountedAssetsTotal } = calculateDiscountedAssets(
    customAssetPricing,
    params.assetBreakdown,
    frequencyMultiplier
  );
  
  if (discountedAssets.length > 0) {
    result.discountedAssets = discountedAssets;
    result.discountedAssetsTotal = discountedAssetsTotal;
  }
  
  // Filter out discounted assets from asset breakdown for normal calculations
  const normalAssets = filterNonDiscountedAssets(params.assetBreakdown, customAssetPricing);
  
  // Calculate adjusted total MW (excluding discounted assets)
  const discountedMW = discountedAssets.reduce((sum, a) => sum + a.mw, 0);
  const adjustedTotalMW = totalMW - discountedMW;
  
  // Use adjusted params for remaining calculations
  const adjustedParams = {
    ...params,
    totalMW: adjustedTotalMW,
    assetBreakdown: normalAssets
  };
  
  // Calculate base pricing (monthly × period months)
  result.basePricingCost = (params.baseMonthlyPrice || 0) * periodMonths;
  
  // Calculate based on package type
  if (packageType === 'per_site') {
    // Per-site billing (UNHCR-style) - calculate based on site billing status
    const onboardingFee = params.onboardingFeePerSite || 1000;
    const annualFee = params.annualFeePerSite || 1000;
    const sitesToBill = params.sitesToBill || [];
    
    let totalOnboarding = 0;
    let totalAnnual = 0;
    let sitesOnboarded = 0;
    let sitesRenewed = 0;
    
    const siteBreakdown: SiteBillingItem[] = sitesToBill.map(site => {
      const onboardingCost = site.needsOnboarding ? onboardingFee : 0;
      const annualCost = site.needsAnnualRenewal ? annualFee : 0;
      
      if (site.needsOnboarding) {
        totalOnboarding += onboardingFee;
        sitesOnboarded++;
      }
      if (site.needsAnnualRenewal) {
        totalAnnual += annualFee;
        sitesRenewed++;
      }
      
      return {
        ...site,
        onboardingFee: onboardingCost,
        annualFee: annualCost
      };
    });
    
    result.perSiteBreakdown = {
      onboardingCost: totalOnboarding,
      annualSubscriptionCost: totalAnnual,
      sitesOnboarded,
      sitesRenewed,
      siteBreakdown
    };
    
    // For per-site, the "totalMWCost" represents the total site fees
    result.totalMWCost = totalOnboarding + totalAnnual;
  } else if (packageType === 'starter') {
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
  } else if (packageType === 'elum_epm') {
    // Elum ePM - site-size threshold per-MWp pricing
    const threshold = params.siteSizeThresholdKwp || 100;
    const belowPrice = params.belowThresholdPricePerMWp || 50;
    const abovePrice = params.aboveThresholdPricePerMWp || 30;
    const assets = normalAssets; // Use filtered assets (excluding discounted)
    
    // Get applicable minimum fee per site from tiers (used as floor, not additive)
    const minimumFeePerSite = params.minimumChargeTiers && params.minimumChargeTiers.length > 0
      ? getApplicableMinimumCharge(adjustedTotalMW, params.minimumChargeTiers)
      : 0;
    
    if (assets.length > 0) {
      const breakdown = calculateElumEpmBreakdown(
        assets,
        threshold,
        belowPrice,
        abovePrice,
        frequencyMultiplier,
        minimumFeePerSite  // Pass minimum fee for per-site floor comparison
      );
      result.elumEpmBreakdown = breakdown;
      result.totalMWCost = breakdown.totalCost;
    }
  } else if (packageType === 'elum_jubaili') {
    // Elum Jubaili - per-site fee with tiered support
    const perSiteFee = params.annualFeePerSite || 500;
    const assets = normalAssets; // Use filtered assets (excluding discounted)
    
    if (assets.length > 0) {
      const breakdown = calculateElumJubailiBreakdown(
        assets,
        perSiteFee,
        frequencyMultiplier,
        adjustedTotalMW,
        params.minimumChargeTiers
      );
      result.elumJubailiBreakdown = breakdown;
      result.totalMWCost = breakdown.totalCost;
    }
  } else if (packageType === 'elum_portfolio_os') {
    // Elum Portfolio OS - full pricing flexibility like pro/custom
    const { moduleCosts, totalMWCost } = calculateModuleCosts(adjustedParams);
    result.moduleCosts = moduleCosts;
    result.totalMWCost = totalMWCost;
  } else if (packageType === 'elum_internal') {
    // Elum Internal Assets - graduated MW pricing
    const tiers = params.graduatedMWTiers || [];
    
    if (tiers.length > 0 && adjustedTotalMW > 0) {
      const breakdown = calculateElumInternalBreakdown(
        adjustedTotalMW,
        tiers,
        frequencyMultiplier
      );
      result.elumInternalBreakdown = breakdown;
      result.totalMWCost = breakdown.totalCost;
    }
  } else {
    // Pro or Custom - calculate module costs
    const { moduleCosts, totalMWCost } = calculateModuleCosts(adjustedParams);
    result.moduleCosts = moduleCosts;
    result.totalMWCost = totalMWCost;
    
    // Apply site-level minimum pricing if enabled and data available
    if (params.enableSiteMinimumPricing && 
        normalAssets.length > 0 &&
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
        normalAssets,
        perMWpRate,
        adjustedTotalMW,
        params.minimumChargeTiers,
        frequencyMultiplier,
        params.siteChargeFrequency || "annual",
        params.billingFrequency
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
  // Skip for elum_epm as minimum is applied per-site as a floor in the breakdown
  if (!result.siteMinimumPricingBreakdown && packageType !== 'elum_epm') {
    result.minimumCharges = calculateMinimumCharges(
      minimumCharge,
      sitesUnderThreshold,
      frequencyMultiplier,
      totalMW,
      params.minimumChargeTiers,
      params.siteChargeFrequency || "annual",
      params.billingFrequency
    );
  }
  
  // Calculate base cost (modules + minimum charges, or package cost)
  let baseCost = result.starterPackageCost + result.totalMWCost + result.minimumCharges;
  
  // Apply minimum annual value to BASE COST only (for Pro, Custom, and Elum packages)
  if ((packageType === 'pro' || packageType === 'custom' || packageType === 'elum_portfolio_os' || packageType === 'elum_internal') && minimumAnnualValue) {
    const minimumForPeriod = minimumAnnualValue * frequencyMultiplier;
    if (baseCost < minimumForPeriod) {
      // Add the difference as a "minimum contract value adjustment"
      const adjustment = minimumForPeriod - baseCost;
      result.minimumContractAdjustment = adjustment;
      baseCost = minimumForPeriod;
    }
  }
  
  // Calculate retainer cost
  const calculatedRetainer = (params.retainerHours || 0) * (params.retainerHourlyRate || 0);
  const retainerMinimum = params.retainerMinimumValue || 0;
  const hasRetainer = (params.retainerHours && params.retainerHours > 0) || retainerMinimum > 0;
  
  result.retainerCalculatedCost = calculatedRetainer;
  result.retainerMinimumApplied = hasRetainer && calculatedRetainer < retainerMinimum;
  result.retainerCost = hasRetainer ? Math.max(calculatedRetainer, retainerMinimum) : 0;
  
  // Calculate final total: base cost + addons + base pricing + retainer + discounted assets
  const addonTotal = result.addonCosts.reduce((sum, item) => sum + item.cost, 0);
  result.totalPrice = baseCost + addonTotal + result.basePricingCost + result.retainerCost + discountedAssetsTotal;
  
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

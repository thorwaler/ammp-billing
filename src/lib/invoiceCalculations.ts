// Shared invoice calculation logic
import { 
  MODULES, 
  ADDONS, 
  MODULES_2026,
  ADDONS_2026,
  SPS_ADDONS,
  TRIAL_2026,
  isPackage2026,
  isSolarAfricaPackage,
  isSpsPackage,
  isMatriarchApiPackage,
  isElumOrgTierPackage,
  elumTierForPackage,
  isEnterpriseEconfPackage,
  ENTERPRISE_ECONF_BASE_RATE,
  ENTERPRISE_ECONF_ECONF_RATE,
  getElumProBucket,
  getElumUtilityTier,
  ELUM_LITE_BASE_RATE,
  ELUM_LITE_ECONF_RATE,
  ELUM_TIER_LABELS,
  ELUM_UTILITY_MIN_SITE_MWP,
  ELUM_INTERNAL_2026_BRACKETS,
  ELUM_INTERNAL_2026_ECONF_RATE,
  calculateElumInternalSteppedCost,
  type ElumInternalBracket,
  getSolarAfricaTier,
  getAddonPrice, 
  calculateTieredPrice,
  getIrradianceSiteTierRate,
  calculatePerformanceMWpCost,
  type ComplexityLevel, 
  type PricingTier,
  type DiscountTier,
  type MinimumChargeTier,
  type GraduatedMWTier,
  type ModuleDefinition,
  type AddonDefinition,
  type IrradianceSiteTier,
  type PerformanceMWpTier,
  type ElumOrgTier
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
    capacityKWp?: number;
    isHybrid?: boolean;
    hasSolcast?: boolean;
    solcastOnboardingDate?: string;
    onboardingDate?: string;
    deviceCount?: number;
    devices?: Array<{
      deviceId: string;
      deviceName: string;
      deviceType: string;
      manufacturer?: string;
      model?: string;
      dataProvider?: string;
    }>;
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
  // Pro-rata Solcast calculation fields
  invoiceDate?: Date;
  periodStart?: string;
  periodEnd?: string;
  // AMMP OS 2026 trial fields
  isTrial?: boolean;
  trialSetupFee?: number;
  vendorApiOnboardingFee?: number;
  // SolarAfrica API fields
  municipalityCount?: number;
  apiSetupFee?: number;
  hourlyRate?: number;
  customizationHours?: number;
  includeSetupFee?: boolean;
  // Custom contract type fields
  customModuleDefinitions?: ModuleDefinition[];
  customAddonDefinitions?: AddonDefinition[];
  // SPS Monitoring discount fields
  upfrontDiscountPercent?: number;
  commitmentDiscountPercent?: number;
  // Matriarch API fields
  irradiancePerSiteTiers?: IrradianceSiteTier[];
  performancePerMwpTiers?: PerformanceMWpTier[];
  // Per-MW with Annual Upfront Minimum fields
  annualMinimumFee?: number;
  committedMinimumMW?: number;
  annualBillingAnchorDate?: string | Date;
  ytdInvoicedAmount?: number;
  // When true the calc treats the current invoice as the upfront annual cycle;
  // when false it treats it as a quarterly overage cycle. If undefined, the calc
  // derives it from `periodStart` vs `annualBillingAnchorDate` (anchor month = annual).
  perMWAnnualUpfrontIsAnnualCycle?: boolean;
  // SPS Monitoring annual-upfront dual cadence. Mirrors the per-MW version:
  // true = annual upfront cycle, false = quarterly with prepaid-balance credit.
  // For SPS, `ytdInvoicedAmount` is repurposed as the remaining prepaid balance.
  spsIsAnnualCycle?: boolean;
  // Elum 2026 org-based tiers: per-sub-org asset grouping resolved at sync time.
  orgBreakdown?: OrgAssetGroup[];
  // C&I Lite rates (editable defaults)
  elumLiteBaseRate?: number;
  elumLiteEconfRate?: number;
  // Internal 2026 stepped brackets + optional eConf add-on rate
  elumInternalBrackets?: ElumInternalBracket[];
  elumInternalEconfRate?: number;
  // Assets where MWh was entered in the PV capacity field (battery-only utility
  // sites). Suppresses the utility >2 MWp guard for those assets.
  mwhOverrideAssetIds?: string[];
}

/** A sub-organisation with its resolved assets, produced by the AMMP sync. */
export interface OrgAssetGroup {
  orgId: string;
  orgName: string;
  uid?: number;
  tier?: ElumOrgTier | null;
  hasEconf?: boolean;
  /** true when these assets came from a legacy asset group, not org discovery */
  isLegacyAssetGroup?: boolean;
  assets: Array<{
    assetId: string;
    assetName: string;
    totalMW: number;
  }>;
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

export interface ElumOrgSiteLine {
  assetId: string;
  assetName: string;
  mwp: number;
  bucketLabel?: string;
  pricePerMWp: number;
  cost: number;
  isMwhOverride?: boolean;
}

export interface ElumOrgLine {
  orgId: string;
  orgName: string;
  uid?: number;
  tier: ElumOrgTier;
  tierLabel: string;
  isLegacyAssetGroup?: boolean;
  totalMWp: number;
  siteCount: number;
  /** applied rate: base rate (lite), blended rate (utility), null for per-site pro */
  appliedRate: number | null;
  appliedTierLabel?: string;
  baseCost: number;
  /** Internal tier: stepped bracket detail behind baseCost */
  bracketBreakdown?: Array<{ label: string; mwInBracket: number; pricePerMWp: number; cost: number }>;
  /** C&I Lite org-wide remote eConf add-on */
  econfApplied: boolean;
  econfRate: number;
  econfCost: number;
  totalCost: number;
  sites: ElumOrgSiteLine[];
  warnings: string[];
}

export interface ElumOrgTierBreakdown {
  tier: ElumOrgTier;
  tierLabel: string;
  orgs: ElumOrgLine[];
  totalMWp: number;
  totalCost: number;
  warnings: string[];
  blocked: boolean;
}

export interface MatriarchApiBreakdown {
  irradianceOnlySites: number;
  irradiancePerSiteRate: number;
  irradianceMonthlyTotal: number;
  irradianceAnnualTotal: number;
  performanceSites: number;
  performanceTotalMWp: number;
  performanceAnnualTotal: number;
  performanceTierBreakdown: Array<{ label: string; mwInTier: number; pricePerMWp: number; cost: number }>;
  totalAnnualCost: number;
  // Per-asset classification used to produce the counts above. Persisted so the
  // support document row-level table can match the dual-sub summary exactly,
  // even if cached AMMP capabilities change after invoice creation.
  irradianceAssetIds?: string[];
  performanceAssetIds?: string[];
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
  // Matriarch API breakdown
  matriarchApiBreakdown?: MatriarchApiBreakdown;
  // Elum 2026 org-based tier breakdown
  elumOrgTierBreakdown?: ElumOrgTierBreakdown;
  // Discounted assets results
  discountedAssets?: DiscountedAssetResult[];
  discountedAssetsTotal?: number;
  // SPS Monitoring discount breakdown
  spsDiscountBreakdown?: {
    preDiscountMonitoringFee: number;
    volumeDiscountPercent: number;
    volumeDiscountAmount: number;
    afterVolumeDiscount: number;
    upfrontDiscountPercent: number;
    upfrontDiscountAmount: number;
    afterUpfrontDiscount: number;
    commitmentDiscountPercent: number;
    commitmentDiscountAmount: number;
    finalMonitoringFee: number;
    minimumApplied: boolean;
    minimumQuarterlyValue: number;
    upfrontAnnualPayment?: number;
    excessAnnualAmount?: number;
  };
  // SPS Monitoring annual-upfront dual cadence breakdown
  spsAnnualUpfrontBreakdown?: {
    cycleType: 'annual_upfront' | 'quarterly_with_credit';
    annualDiscountedFee: number;
    annualMinimum: number;
    annualUpfrontAmount: number;
    quarterCost: number;
    prepaidBalanceBefore: number;
    creditApplied: number;
    prepaidBalanceAfter: number;
  };
  // Per-MW + Annual Upfront Minimum breakdown
  perMWAnnualUpfrontBreakdown?: {
    cycleType: 'annual_upfront' | 'quarterly_overage';
    perMWpRate: number;
    annualFloor: number;
    fixedAnnualMinimum: number;
    syncedMW: number;
    mwBasedFloor: number;
    ytdModuleValue: number;
    ytdInvoiced: number;
    overageAmount: number;
  };
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
  
  // Use custom module definitions if provided, otherwise use built-in lists
  const moduleList = params.customModuleDefinitions || (isPackage2026(packageType) ? MODULES_2026 : MODULES);
  
  const moduleCosts = selectedModules.map(moduleId => {
    const module = moduleList.find(m => m.id === moduleId);
    if (!module) return null;
    
    // Use custom pricing if available
    let price = module.price;
    if (customPricing && customPricing[moduleId] !== undefined) {
      price = customPricing[moduleId];
    }
    
    // Apply trial discount for 2026 package
    if (isPackage2026(packageType) && params.isTrial) {
      price = price * (1 - TRIAL_2026.moduleDiscount);
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
 * Get months for a billing period.
 * When periodStart/periodEnd are provided, iterate the actual months of that
 * period (so catch-up / short periods bill only the months they cover).
 * Otherwise fall back to walking back the nominal frequency from the invoice date.
 */
function getMonthsForPeriodCalc(
  billingFrequency: string,
  invoiceDate?: Date,
  periodStart?: string,
  periodEnd?: string
): Date[] {
  const months: Date[] = [];

  if (periodStart && periodEnd) {
    const startStr = periodStart.split('T')[0] || periodStart.substring(0, 10);
    const endStr = periodEnd.split('T')[0] || periodEnd.substring(0, 10);
    const [sy, sm, sd] = startStr.split('-').map(Number);
    const [ey, em, ed] = endStr.split('-').map(Number);
    const start = new Date(sy, sm - 1, sd);
    const end = new Date(ey, em - 1, ed);
    let current = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
    while (current <= endMonth) {
      months.push(new Date(current));
      current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    }
    return months;
  }

  const monthCount = getPeriodMonthsMultiplier(billingFrequency);
  const baseDate = invoiceDate || new Date();
  for (let i = monthCount - 1; i >= 0; i--) {
    months.push(new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 1));
  }
  return months;
}

/**
 * Get end of month for a given date
 */
function getEndOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

/**
 * Calculate addon costs with tiered pricing support
 * Now supports pro-rata Solcast calculation based on solcastOnboardingDate
 */
export function calculateAddonCosts(
  selectedAddons: CalculationParams['selectedAddons'],
  frequencyMultiplier: number,
  billingFrequency?: string,
  assetBreakdown?: CalculationParams['assetBreakdown'],
  invoiceDate?: Date,
  periodStart?: string,
  periodEnd?: string,
  customAddonDefinitions?: AddonDefinition[]
): CalculationResult['addonCosts'] {
  return selectedAddons.map(addon => {
    // Check custom addon definitions first, then built-in lists (including SPS addons)
    const addonDef = customAddonDefinitions?.find(a => a.id === addon.id) 
      || ADDONS.find(a => a.id === addon.id) 
      || ADDONS_2026.find(a => a.id === addon.id)
      || SPS_ADDONS.find(a => a.id === addon.id);
    if (!addonDef) return null;
    
    // Handle tiered pricing first
    if (addonDef.tieredPricing && addon.quantity) {
      const tierCalc = calculateTieredPrice(addonDef, addon.quantity, addon.customTiers);
      
      // Satellite Data API - use pro-rata calculation if we have asset breakdown
      if (addon.id === 'satelliteDataAPI' && billingFrequency && assetBreakdown && assetBreakdown.length > 0) {
        const solcastAssets = assetBreakdown.filter(a => a.hasSolcast);
        
        if (solcastAssets.length > 0) {
          const months = getMonthsForPeriodCalc(billingFrequency, invoiceDate, periodStart, periodEnd);
          
          let totalSiteMonths = 0;
          for (const month of months) {
            const endOfMonth = getEndOfMonth(month);
            // Count Solcast assets that were onboarded before or during this month
            const activeSites = solcastAssets.filter(asset => {
              const deviceDate = asset.solcastOnboardingDate || asset.onboardingDate;
              if (!deviceDate) return true; // No date = assume active
              return new Date(deviceDate) <= endOfMonth;
            }).length;
            totalSiteMonths += activeSites;
          }
          
          // Pro-rata cost: site-months × price per unit
          const proRataCost = totalSiteMonths * tierCalc.pricePerUnit;
          
          return {
            addonId: addon.id,
            addonName: addonDef.name,
            cost: proRataCost,
            quantity: addon.quantity,
            tierApplied: tierCalc.appliedTier,
            pricePerUnit: tierCalc.pricePerUnit
          };
        }
      }
      
      // Non-Solcast addons or no asset data - use flat calculation
      // For Satellite Data API, prefer the actual month count from the billing
      // period (catch-up / short periods) instead of the nominal frequency.
      const priceMultiplier = addon.id === 'satelliteDataAPI' && billingFrequency
        ? getMonthsForPeriodCalc(billingFrequency, invoiceDate, periodStart, periodEnd).length
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
 * Elum 2026 org-based tier pricing.
 *
 * Each sub-organisation is priced on its own full portfolio and produces one
 * invoice line:
 *   C&I Lite  — base €/MWp on the org portfolio + org-wide remote eConf add-on
 *               charged on ALL sites when the org carries the flag
 *   C&I Pro   — site by site, by size bucket (never aggregated)
 *   Utility   — single blended rate determined by the org portfolio size,
 *               applied uniformly to every MWp. Only available when every site
 *               exceeds 2 MWp; otherwise the org is blocked.
 *   Internal  — stepped MWp brackets on the org portfolio (150 / 75 / 37.50),
 *               each bracket's rate applied only to the MWp inside it. eConf is
 *               supported and billed at an optional add-on rate (default 0).
 */
export function calculateElumOrgTierBreakdown(
  tier: ElumOrgTier,
  orgs: OrgAssetGroup[],
  frequencyMultiplier: number,
  options: {
    liteBaseRate?: number;
    liteEconfRate?: number;
    internalBrackets?: ElumInternalBracket[];
    internalEconfRate?: number;
    mwhOverrideAssetIds?: string[];
    /** Display label override (e.g. "Enterprise eConf" reusing the Lite maths) */
    tierLabelOverride?: string;
  } = {}
): ElumOrgTierBreakdown {
  const liteBaseRate = options.liteBaseRate ?? ELUM_LITE_BASE_RATE;
  const liteEconfRate = options.liteEconfRate ?? ELUM_LITE_ECONF_RATE;
  const internalBrackets = options.internalBrackets?.length
    ? options.internalBrackets
    : ELUM_INTERNAL_2026_BRACKETS;
  const internalEconfRate = options.internalEconfRate ?? ELUM_INTERNAL_2026_ECONF_RATE;
  const mwhOverrides = new Set(options.mwhOverrideAssetIds || []);
  const tierLabel = options.tierLabelOverride ?? ELUM_TIER_LABELS[tier];


  const orgLines: ElumOrgLine[] = [];
  const globalWarnings: string[] = [];
  let blocked = false;

  for (const org of orgs) {
    const assets = org.assets || [];
    const totalMWp = assets.reduce((sum, a) => sum + (a.totalMW || 0), 0);
    const warnings: string[] = [];
    const sites: ElumOrgSiteLine[] = [];

    let baseCost = 0;
    let appliedRate: number | null = null;
    let appliedTierLabel: string | undefined;
    let bracketBreakdown: ElumOrgLine["bracketBreakdown"];

    if (tier === "ci_pro") {
      for (const asset of assets) {
        const bucket = getElumProBucket(asset.totalMW || 0);
        const cost = (asset.totalMW || 0) * bucket.pricePerMWp * frequencyMultiplier;
        baseCost += cost;
        sites.push({
          assetId: asset.assetId,
          assetName: asset.assetName,
          mwp: asset.totalMW || 0,
          bucketLabel: bucket.label,
          pricePerMWp: bucket.pricePerMWp,
          cost,
        });
      }
    } else if (tier === "utility") {
      const utilityTier = getElumUtilityTier(totalMWp);
      appliedRate = utilityTier.pricePerMWp;
      appliedTierLabel = utilityTier.label;

      const offending = assets.filter(
        a => (a.totalMW || 0) <= ELUM_UTILITY_MIN_SITE_MWP && !mwhOverrides.has(a.assetId)
      );
      if (offending.length > 0) {
        blocked = true;
        warnings.push(
          `Utility tier requires every site above ${ELUM_UTILITY_MIN_SITE_MWP} MWp. ` +
          `${offending.length} site(s) below threshold: ${offending.map(a => `${a.assetName} (${(a.totalMW || 0).toFixed(3)} MWp)`).join(", ")}. ` +
          `Fix the PV capacity in ePM, or mark battery-only sites as MWh entries.`
        );
      }

      for (const asset of assets) {
        const cost = (asset.totalMW || 0) * utilityTier.pricePerMWp * frequencyMultiplier;
        baseCost += cost;
        sites.push({
          assetId: asset.assetId,
          assetName: asset.assetName,
          mwp: asset.totalMW || 0,
          bucketLabel: utilityTier.label,
          pricePerMWp: utilityTier.pricePerMWp,
          cost,
          isMwhOverride: mwhOverrides.has(asset.assetId),
        });
      }
    } else if (tier === "internal") {
      // Internal 2026: stepped brackets on the org portfolio
      const stepped = calculateElumInternalSteppedCost(totalMWp, internalBrackets);
      baseCost = stepped.totalCost * frequencyMultiplier;
      bracketBreakdown = stepped.brackets.map(b => ({
        ...b,
        cost: b.cost * frequencyMultiplier,
      }));
      // Blended effective rate so per-site rows reconcile with the org total
      const blendedRate = totalMWp > 0 ? stepped.totalCost / totalMWp : 0;
      appliedRate = blendedRate;
      appliedTierLabel = stepped.brackets.map(b => b.label).join(" + ") || undefined;
      for (const asset of assets) {
        sites.push({
          assetId: asset.assetId,
          assetName: asset.assetName,
          mwp: asset.totalMW || 0,
          pricePerMWp: blendedRate,
          cost: (asset.totalMW || 0) * blendedRate * frequencyMultiplier,
        });
      }
    } else {
      // C&I Lite
      appliedRate = liteBaseRate;
      baseCost = totalMWp * liteBaseRate * frequencyMultiplier;
      for (const asset of assets) {
        sites.push({
          assetId: asset.assetId,
          assetName: asset.assetName,
          mwp: asset.totalMW || 0,
          pricePerMWp: liteBaseRate,
          cost: (asset.totalMW || 0) * liteBaseRate * frequencyMultiplier,
        });
      }
    }

    // Remote eConf: billable org-wide add-on on C&I Lite and Internal
    // (bundled in Pro / Utility). Internal defaults to a 0 rate until agreed.
    const econfRate = tier === "internal" ? internalEconfRate : liteEconfRate;
    const econfApplied =
      (tier === "ci_lite" || tier === "internal") && !!org.hasEconf && econfRate > 0;
    const econfCost = econfApplied ? totalMWp * econfRate * frequencyMultiplier : 0;

    // The org is invoiced as one line (base + eConf), so the per-site detail must
    // show the combined effective rate — otherwise the site rows only add up to
    // the base cost and don't reconcile with the invoiced total.
    if (econfApplied) {
      for (const site of sites) {
        site.pricePerMWp = site.pricePerMWp + econfRate;
        site.cost = site.mwp * site.pricePerMWp * frequencyMultiplier;
      }
    }

    if (assets.length === 0) {
      warnings.push("No assets resolved for this organisation.");
    }

    orgLines.push({
      orgId: org.orgId,
      orgName: org.orgName,
      uid: org.uid,
      tier,
      tierLabel,
      isLegacyAssetGroup: org.isLegacyAssetGroup,
      totalMWp,
      siteCount: assets.length,
      appliedRate,
      appliedTierLabel,
      baseCost,
      bracketBreakdown,
      econfApplied,
      econfRate,
      econfCost,
      totalCost: baseCost + econfCost,
      sites,
      warnings,
    });
  }

  if (orgLines.length === 0) {
    globalWarnings.push(
      `No ${tierLabel} organisations resolved. Re-sync the contract to discover sub-orgs.`
    );
  }

  return {
    tier,
    tierLabel,
    orgs: orgLines,
    totalMWp: orgLines.reduce((sum, o) => sum + o.totalMWp, 0),
    totalCost: orgLines.reduce((sum, o) => sum + o.totalCost, 0),
    // Only blocking per-org warnings are surfaced contract-wide; informational
    // per-org notices stay scoped to their own org row.
    warnings: [
      ...globalWarnings,
      ...orgLines.flatMap(o => o.warnings.filter(w => w.startsWith("Utility tier requires"))),
    ],
    blocked,
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
  assetBreakdown: CalculationParams['assetBreakdown'],
  customAssetPricing: CustomAssetPricing | undefined
): NonNullable<CalculationParams['assetBreakdown']> {
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
  } else if (packageType === 'hybrid_tiered' || packageType === 'hybrid_tiered_assetgroups') {
    // Hybrid tiered - special per-MWp rates (asset group filtering happens at sync time)
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
  } else if (isElumOrgTierPackage(packageType)) {
    // Elum 2026 org-based tiers (C&I Lite / C&I Pro / Utility)
    const tier = elumTierForPackage(packageType)!;
    const breakdown = calculateElumOrgTierBreakdown(
      tier,
      params.orgBreakdown || [],
      frequencyMultiplier,
      {
        liteBaseRate: params.elumLiteBaseRate,
        liteEconfRate: params.elumLiteEconfRate,
        internalBrackets: params.elumInternalBrackets,
        internalEconfRate: params.elumInternalEconfRate,
        mwhOverrideAssetIds: params.mwhOverrideAssetIds,
      }
    );
    result.elumOrgTierBreakdown = breakdown;
    result.totalMWCost = breakdown.totalCost;
  } else if (isEnterpriseEconfPackage(packageType)) {
    // Enterprise eConf — asset-group based. Same maths as C&I Lite (base €/MWp
    // on the portfolio + eConf add-on on every MWp of the eConf segment), but
    // the segments come from asset groups resolved at sync time.
    const breakdown = calculateElumOrgTierBreakdown(
      "ci_lite",
      params.orgBreakdown || [],
      frequencyMultiplier,
      {
        liteBaseRate: params.elumLiteBaseRate ?? ENTERPRISE_ECONF_BASE_RATE,
        liteEconfRate: params.elumLiteEconfRate ?? ENTERPRISE_ECONF_ECONF_RATE,
        tierLabelOverride: "Enterprise eConf",
      }
    );
    result.elumOrgTierBreakdown = breakdown;
    result.totalMWCost = breakdown.totalCost;
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
  } else if (packageType === 'ammp_os_2026') {
    // AMMP OS 2026 - module-based pricing like pro/custom
    const { moduleCosts, totalMWCost } = calculateModuleCosts(adjustedParams);
    result.moduleCosts = moduleCosts;
    result.totalMWCost = totalMWCost;
  } else if (packageType === 'sps_monitoring') {
    // SPS Monitoring - module-based pricing with 3 stacking discounts.
    // Calculate at ANNUAL rate first, regardless of billing frequency.
    const annualParams = { ...adjustedParams, frequencyMultiplier: 1 };
    const { moduleCosts: annualModuleCosts, totalMWCost: annualModuleCost } = calculateModuleCosts(annualParams);

    // Pre-discount ANNUAL monitoring fee
    const preDiscountAnnualFee = annualModuleCost;

    // Discounts are ADDITIVE: each applies to the original pre-discount fee,
    // never to a previously-discounted base.
    // 1. Volume discount
    const volumeDiscountPercent = getApplicableDiscount(adjustedTotalMW, params.portfolioDiscountTiers);
    const volumeDiscountAmount = preDiscountAnnualFee * (volumeDiscountPercent / 100);

    // 2. Upfront discount (anchored to preDiscount, not to afterVolume)
    const upfrontDiscountPercent = params.upfrontDiscountPercent || 0;
    const upfrontDiscountAmount = preDiscountAnnualFee * (upfrontDiscountPercent / 100);

    // 3. Commitment discount (anchored to preDiscount)
    const commitmentDiscountPercent = params.commitmentDiscountPercent || 0;
    const commitmentDiscountAmount = preDiscountAnnualFee * (commitmentDiscountPercent / 100);

    // Running subtotals for PDF / UI readability — still equal preDiscount minus
    // the sum of all amounts applied so far.
    const afterVolumeDiscount = preDiscountAnnualFee - volumeDiscountAmount;
    const afterUpfrontDiscount = afterVolumeDiscount - upfrontDiscountAmount;
    const annualDiscountedFee = afterUpfrontDiscount - commitmentDiscountAmount;


    const annualMinimum = minimumAnnualValue || 0;
    // Dual cadence is active when an anchor date is set. Without an anchor we
    // keep the legacy single-cadence behaviour (pro-rated period charge).
    const hasAnnualUpfront = !!params.annualBillingAnchorDate;

    // Per-period scaling factor (e.g. 0.25 for quarterly)
    const periodFraction = frequencyMultiplier;
    const quarterCost = annualDiscountedFee * periodFraction;

    if (hasAnnualUpfront) {
      // Resolve cycle type: explicit flag wins, else derive from anchor month
      let isAnnualCycle: boolean | undefined = params.spsIsAnnualCycle;
      if (isAnnualCycle === undefined) {
        if (params.periodStart) {
          const anchor = new Date(params.annualBillingAnchorDate as string | Date);
          const start = new Date(params.periodStart);
          isAnnualCycle = anchor.getUTCMonth() === start.getUTCMonth();
        } else {
          isAnnualCycle = false;
        }
      }

      // Annual upfront = max(minimum annual contract value, full annual SPS fee)
      const annualUpfrontAmount = Math.max(annualMinimum, annualDiscountedFee);
      const prepaidBalanceBefore = Math.max(0, params.ytdInvoicedAmount || 0);

      let periodMonitoringFee = 0;
      let creditApplied = 0;
      let prepaidBalanceAfter = prepaidBalanceBefore;
      let cycleType: 'annual_upfront' | 'quarterly_with_credit';

      if (isAnnualCycle) {
        // Bill the full annual upfront amount as ONE line; suppress per-module lines
        cycleType = 'annual_upfront';
        periodMonitoringFee = annualUpfrontAmount;
        prepaidBalanceAfter = annualUpfrontAmount;
        result.moduleCosts = [];
      } else {
        // Quarterly cycle: bill full quarterly value, then apply credit from prepaid balance
        cycleType = 'quarterly_with_credit';
        creditApplied = Math.min(quarterCost, prepaidBalanceBefore);
        periodMonitoringFee = quarterCost - creditApplied;
        prepaidBalanceAfter = Math.max(0, prepaidBalanceBefore - creditApplied);
        // Scale module line items to the period AND to the post-discount fee
        // so they sum to quarterCost (matches the credit basis).
        const discountScale = preDiscountAnnualFee > 0
          ? (annualDiscountedFee / preDiscountAnnualFee)
          : 0;
        result.moduleCosts = annualModuleCosts.map(mc => ({
          ...mc,
          cost: mc.cost * periodFraction * discountScale,
        }));

      }

      result.totalMWCost = periodMonitoringFee;
      result.spsAnnualUpfrontBreakdown = {
        cycleType,
        annualDiscountedFee,
        annualMinimum,
        annualUpfrontAmount,
        quarterCost,
        prepaidBalanceBefore,
        creditApplied,
        prepaidBalanceAfter,
      };
      result.spsDiscountBreakdown = {
        preDiscountMonitoringFee: preDiscountAnnualFee,
        volumeDiscountPercent,
        volumeDiscountAmount,
        afterVolumeDiscount,
        upfrontDiscountPercent,
        upfrontDiscountAmount,
        afterUpfrontDiscount,
        commitmentDiscountPercent,
        commitmentDiscountAmount,
        finalMonitoringFee: annualDiscountedFee,
        minimumApplied: annualMinimum > annualDiscountedFee,
        minimumQuarterlyValue: periodMonitoringFee,
        upfrontAnnualPayment: annualUpfrontAmount,
        excessAnnualAmount: Math.max(0, annualDiscountedFee - annualMinimum),
      };
    } else {
      // Legacy single-cadence behaviour: pro-rate annual fee to billing period,
      // apply pro-rated minimum as a floor.
      result.moduleCosts = annualModuleCosts.map(mc => ({ ...mc, cost: mc.cost * periodFraction }));
      const periodMinimum = annualMinimum * periodFraction;
      const periodFee = Math.max(periodMinimum, quarterCost);
      result.totalMWCost = periodFee;
      const minimumApplied = annualMinimum > 0 && annualDiscountedFee <= annualMinimum;
      result.spsDiscountBreakdown = {
        preDiscountMonitoringFee: preDiscountAnnualFee,
        volumeDiscountPercent,
        volumeDiscountAmount,
        afterVolumeDiscount,
        upfrontDiscountPercent,
        upfrontDiscountAmount,
        afterUpfrontDiscount,
        commitmentDiscountPercent,
        commitmentDiscountAmount,
        finalMonitoringFee: annualDiscountedFee,
        minimumApplied,
        minimumQuarterlyValue: periodFee,
      };
    }

  } else if (packageType === 'solar_africa_api') {
    // SolarAfrica API - tier-based pricing by municipality count
    const municipalityCount = params.municipalityCount || 0;
    const tier = getSolarAfricaTier(municipalityCount);
    const annualSubscription = tier.annualFee * frequencyMultiplier;
    result.totalMWCost = annualSubscription;
    
    // Setup fee as NRR (one-time, controlled by includeSetupFee flag)
    if (params.includeSetupFee && params.apiSetupFee) {
      result.starterPackageCost = params.apiSetupFee;
    }
    
    // Customization hours as NRR
    if (params.customizationHours && params.hourlyRate) {
      result.retainerCost = params.customizationHours * params.hourlyRate;
      result.retainerCalculatedCost = result.retainerCost;
    }
  } else if (packageType === 'matriarch_api') {
    // Matriarch API - dual subscription: irradiance-only (per site/month) + performance (per MWp/year)
    const assets = normalAssets;
    
    // Classify sites: irradiance-only vs performance
    // Irradiance-only: hasSolcast && (deviceCount <= 1 or no non-satellite devices)
    const irradianceOnlySites: typeof assets = [];
    const performanceSites: typeof assets = [];
    
    for (const asset of assets) {
      const hasDevicesBeyondSolcast = (asset.deviceCount || 0) > 1 || 
        (asset.devices && asset.devices.some((d) => 
          d.deviceType && !['solcast', 'satellite', 'irradiance'].includes(d.deviceType.toLowerCase())
        ));
      
      if (asset.hasSolcast && !hasDevicesBeyondSolcast) {
        irradianceOnlySites.push(asset);
      } else {
        performanceSites.push(asset);
      }
    }
    
    // Calculate irradiance component (monthly per-site, annualized)
    const irradianceCount = irradianceOnlySites.length;
    const irradianceRate = getIrradianceSiteTierRate(irradianceCount, params.irradiancePerSiteTiers);
    const irradianceMonthly = irradianceCount * irradianceRate;
    const irradianceAnnual = irradianceMonthly * 12;
    
    // Calculate performance component (annual per-MWp graduated)
    const perfTotalMWp = performanceSites.reduce((sum, a) => sum + a.totalMW, 0);
    const perfResult = calculatePerformanceMWpCost(perfTotalMWp, params.performancePerMwpTiers);
    
    const totalAnnual = irradianceAnnual + perfResult.totalCost;
    
    result.matriarchApiBreakdown = {
      irradianceOnlySites: irradianceCount,
      irradiancePerSiteRate: irradianceRate,
      irradianceMonthlyTotal: irradianceMonthly,
      irradianceAnnualTotal: irradianceAnnual,
      performanceSites: performanceSites.length,
      performanceTotalMWp: perfTotalMWp,
      performanceAnnualTotal: perfResult.totalCost,
      performanceTierBreakdown: perfResult.tierBreakdown,
      totalAnnualCost: totalAnnual,
      irradianceAssetIds: irradianceOnlySites.map(a => a.assetId),
      performanceAssetIds: performanceSites.map(a => a.assetId),
    };
    
    result.totalMWCost = totalAnnual * frequencyMultiplier;
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
        const moduleList = params.customModuleDefinitions || MODULES;
        const module = moduleList.find(m => m.id === moduleId);
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
  
  // Calculate addon costs (with pro-rata Solcast calculation if asset breakdown available)
  result.addonCosts = calculateAddonCosts(
    selectedAddons, 
    frequencyMultiplier, 
    params.billingFrequency,
    params.assetBreakdown,
    params.invoiceDate,
    params.periodStart,
    params.periodEnd,
    params.customAddonDefinitions
  );
  
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
  
  // Apply minimum annual value to BASE COST only (for Pro, Custom, 2026, and Elum packages - not SolarAfrica)
  if ((packageType === 'pro' || packageType === 'custom' || packageType === 'elum_portfolio_os' || packageType === 'elum_internal' || packageType === 'ammp_os_2026' || packageType === 'enterprise_econf') && minimumAnnualValue) {
    const minimumForPeriod = minimumAnnualValue * frequencyMultiplier;
    if (baseCost < minimumForPeriod) {
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
  
  // Calculate final total: base cost + addons + base pricing + retainer + discounted assets + trial fees
  const addonTotal = result.addonCosts.reduce((sum, item) => sum + item.cost, 0);
  let trialFees = 0;
  if (isPackage2026(packageType) && params.isTrial) {
    trialFees = (params.trialSetupFee || TRIAL_2026.setupFee) + (params.vendorApiOnboardingFee || TRIAL_2026.vendorApiOnboardingFee);
  }
  result.totalPrice = baseCost + addonTotal + result.basePricingCost + result.retainerCost + discountedAssetsTotal + trialFees;

  // Per-MW + Annual Upfront Minimum — overrides totalPrice with floor or overage logic
  if (packageType === 'per_mw_annual_upfront') {
    const perMWpRate = params.selectedModules.reduce((sum, moduleId) => {
      const moduleList = params.customModuleDefinitions || MODULES;
      const module = moduleList.find(m => m.id === moduleId);
      const price = params.customPricing?.[moduleId] ?? module?.price ?? 0;
      return sum + price;
    }, 0);

    const fixedAnnualMinimum = params.annualMinimumFee || 0;
    // Floor's MW-based component uses live AMMP-synced MW (adjustedTotalMW),
    // not a static committed value on the contract.
    const mwBasedFloor = adjustedTotalMW * perMWpRate;
    const annualFloor = Math.max(fixedAnnualMinimum, mwBasedFloor);

    // Annual module value at current MW (full-year basis)
    const annualModuleValue = adjustedTotalMW * perMWpRate;

    // Derive cycle type if not provided
    let isAnnualCycle = params.perMWAnnualUpfrontIsAnnualCycle;
    if (isAnnualCycle === undefined) {
      // Anchor month match → annual cycle. Defaults to false if no info.
      if (params.annualBillingAnchorDate && params.periodStart) {
        const anchor = new Date(params.annualBillingAnchorDate);
        const start = new Date(params.periodStart);
        isAnnualCycle = anchor.getUTCMonth() === start.getUTCMonth();
      } else {
        isAnnualCycle = (params.billingFrequency || 'annual') === 'annual';
      }
    }

    const ytdInvoiced = params.ytdInvoicedAmount || 0;
    let cycleAmount = 0;
    let overageAmount = 0;
    const cycleType: 'annual_upfront' | 'quarterly_overage' = isAnnualCycle ? 'annual_upfront' : 'quarterly_overage';

    if (isAnnualCycle) {
      // Charge the full annual floor upfront. Any YTD excess from the prior year
      // is assumed to have been billed quarterly already.
      cycleAmount = annualFloor;
    } else {
      // Quarterly overage: invoice whatever is needed to bring YTD billed up to
      // max(annualFloor, annualModuleValue). Catches up the floor if the anchor
      // upfront invoice was missed, and bills genuine overage once value > floor.
      const targetYTD = Math.max(annualFloor, annualModuleValue);
      overageAmount = Math.max(0, targetYTD - ytdInvoiced);
      cycleAmount = overageAmount;
    }

    result.perMWAnnualUpfrontBreakdown = {
      cycleType,
      perMWpRate,
      annualFloor,
      fixedAnnualMinimum,
      syncedMW: adjustedTotalMW,
      mwBasedFloor,
      ytdModuleValue: annualModuleValue,
      ytdInvoiced,
      overageAmount,
    };

    // Override total price: addons + retainer + base pricing are still additive.
    result.totalPrice = cycleAmount + addonTotal + result.basePricingCost + result.retainerCost + discountedAssetsTotal;
  }

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

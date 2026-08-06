// Shared pricing data for modules and addons
// Single source of truth for both contract creation and invoice calculation

export interface ModuleDefinition {
  id: string;
  name: string;
  price: number;
  available: boolean;
  trial?: boolean;
}

export interface PricingTier {
  minQuantity: number;
  maxQuantity: number | null; // null for "no upper limit"
  pricePerUnit: number;
  label: string;
}

export interface AddonDefinition {
  id: string;
  name: string;
  price?: number;
  complexityPricing?: boolean;
  tieredPricing?: boolean;
  pricingTiers?: PricingTier[];
  lowPrice?: number;
  mediumPrice?: number;
  highPrice?: number;
  requiresPro?: boolean;
  autoActivateFromAMMP?: boolean;
  ammpSourceField?: string;
}

export interface DiscountTier {
  minMW: number;
  maxMW: number | null;
  discountPercent: number;
  label: string;
}

export interface MinimumChargeTier {
  minMW: number;
  maxMW: number | null;
  chargePerSite: number;
  label: string;
}

export interface GraduatedMWTier {
  minMW: number;
  maxMW: number | null;  // null = no upper limit
  pricePerMW: number;
  label: string;
}

export const MODULES: ModuleDefinition[] = [
  { 
    id: "technicalMonitoring", 
    name: "Technical Monitoring", 
    price: 1000, 
    available: true 
  },
  { 
    id: "energySavingsHub", 
    name: "Energy Savings Hub", 
    price: 500, 
    available: true, 
    trial: true 
  },
  { 
    id: "stakeholderPortal", 
    name: "Stakeholder Portal", 
    price: 250, 
    available: true, 
    trial: true 
  },
  { 
    id: "control", 
    name: "Control", 
    price: 500, 
    available: true, 
    trial: true 
  },
];

export const DEFAULT_PORTFOLIO_DISCOUNT_TIERS: DiscountTier[] = [
  { minMW: 0, maxMW: 49.99, discountPercent: 0, label: "0-49 MW" },
  { minMW: 50, maxMW: 99.99, discountPercent: 5, label: "50-99 MW" },
  { minMW: 100, maxMW: 149.99, discountPercent: 10, label: "100-149 MW" },
  { minMW: 150, maxMW: 199.99, discountPercent: 15, label: "150-199 MW" },
  { minMW: 200, maxMW: null, discountPercent: 20, label: "200+ MW" }
];

export const DEFAULT_MINIMUM_CHARGE_TIERS: MinimumChargeTier[] = [
  { minMW: 0, maxMW: 49.99, chargePerSite: 0, label: "0-49 MW" },
  { minMW: 50, maxMW: 99.99, chargePerSite: 0, label: "50-99 MW" },
  { minMW: 100, maxMW: 149.99, chargePerSite: 0, label: "100-149 MW" },
  { minMW: 150, maxMW: 199.99, chargePerSite: 0, label: "150-199 MW" },
  { minMW: 200, maxMW: null, chargePerSite: 0, label: "200+ MW" }
];

export const DEFAULT_GRADUATED_MW_TIERS: GraduatedMWTier[] = [
  { minMW: 0, maxMW: 100, pricePerMW: 150, label: "0-100 MW" },
  { minMW: 100, maxMW: 500, pricePerMW: 75, label: "100-500 MW" },
  { minMW: 500, maxMW: null, pricePerMW: 37.5, label: "500+ MW" }
];

export const ADDONS: AddonDefinition[] = [
  // Universal Add-ons (independent of modules)
  { 
    id: "customKPIs", 
    name: "Custom KPIs", 
    complexityPricing: true,
    lowPrice: 200,
    mediumPrice: 1500,
    highPrice: 10000
  },
  { 
    id: "customDashboard", 
    name: "Custom Dashboard", 
    price: 1000,
    requiresPro: true
  },
  { 
    id: "customReport", 
    name: "Custom Report", 
    price: 1500,
    requiresPro: true
  },
  { 
    id: "customAlerts", 
    name: "Custom Alerts", 
    price: 150,
    requiresPro: true
  },
  { 
    id: "customAPIIntegration", 
    name: "Custom API Integration", 
    price: 3500 
  },
  { 
    id: "satelliteDataAPI", 
    name: "Satellite Data API Access", 
    tieredPricing: true,
    autoActivateFromAMMP: true,
    ammpSourceField: "sitesWithSolcast",
    pricingTiers: [
      { minQuantity: 0, maxQuantity: 99, pricePerUnit: 3, label: "0-99 sites" },
      { minQuantity: 100, maxQuantity: 499, pricePerUnit: 2, label: "100-499 sites" },
      { minQuantity: 500, maxQuantity: 999, pricePerUnit: 1.5, label: "500-999 sites" },
      { minQuantity: 1000, maxQuantity: null, pricePerUnit: 1, label: "1000+ sites" }
    ]
  },
  { 
    id: "dataLoggerSetup", 
    name: "Data Logger Setup", 
    complexityPricing: true,
    lowPrice: 1000,
    mediumPrice: 2500,
    highPrice: 5000
  },
];

// Package type definitions
export type PackageType = 
  | "starter" 
  | "pro" 
  | "custom" 
  | "hybrid_tiered" 
  | "hybrid_tiered_assetgroups"
  | "capped" 
  | "poc" 
  | "per_site"
  | "elum_epm"
  | "elum_jubaili"
  | "elum_portfolio_os"
  | "elum_internal"
  | "ammp_os_2026"
  | "solar_africa_api"
  | "sps_monitoring"
  | "matriarch_api"
  | "per_mw_annual_upfront"
  | "elum_ci_lite"
  | "elum_ci_pro"
  | "elum_utility"
  | "elum_internal_2026";

// === SolarAfrica API Pricing ===

export interface MunicipalityTier {
  tier: number;
  maxMunicipalities: number;
  annualFee: number;
  label: string;
}

export const SOLAR_AFRICA_MUNICIPALITY_TIERS: MunicipalityTier[] = [
  { tier: 1, maxMunicipalities: 25, annualFee: 5000, label: "Up to 25 municipalities" },
  { tier: 2, maxMunicipalities: 35, annualFee: 7000, label: "Up to 35 municipalities" },
  { tier: 3, maxMunicipalities: 45, annualFee: 9000, label: "Up to 45 municipalities" },
  { tier: 4, maxMunicipalities: 55, annualFee: 11000, label: "Up to 55 municipalities" },
  { tier: 5, maxMunicipalities: 65, annualFee: 13000, label: "Up to 65 municipalities" },
];

export const SOLAR_AFRICA_SETUP_FEE = 16500;
export const SOLAR_AFRICA_CUSTOMIZATION_HOURLY_RATE = 120;

export function getSolarAfricaTier(municipalityCount: number): MunicipalityTier {
  return SOLAR_AFRICA_MUNICIPALITY_TIERS.find(t => municipalityCount <= t.maxMunicipalities)
    || SOLAR_AFRICA_MUNICIPALITY_TIERS[SOLAR_AFRICA_MUNICIPALITY_TIERS.length - 1];
}

// === AMMP OS 2026 Pricing ===

export type DeliverableType = "dashboard" | "report" | "10_alerts";

export const MODULES_2026: ModuleDefinition[] = [
  { id: "smartAlerting", name: "Smart Alerting", price: 400, available: true },
  { id: "liveMonitoring", name: "Live Monitoring and Alerting", price: 600, available: true },
  { id: "performanceMonitoring", name: "Performance Monitoring and Reporting", price: 600, available: true },
  { id: "financialReporting", name: "Financial Reporting", price: 300, available: true },
  { id: "dataApi", name: "Data API", price: 100, available: true },
];

export const ADDONS_2026: AddonDefinition[] = [
  {
    id: "dataLoggerSetup2026",
    name: "Data Logger Setup",
    complexityPricing: true,
    lowPrice: 1200,
    mediumPrice: 3000,
    highPrice: 5000,
  },
  {
    id: "customDashboardReportAlerts",
    name: "Custom Dashboard / Report / 10 Alerts",
    price: 1500,
  },
  {
    id: "customKPIs2026",
    name: "Custom KPI Development",
    complexityPricing: true,
    lowPrice: 200,
    mediumPrice: 1500,
    highPrice: 10000,
  },
  {
    id: "customAPIDevelopment",
    name: "Custom API Development",
    price: 4000,
  },
];

export const TRIAL_2026 = {
  setupFee: 3200,
  moduleDiscount: 0.5,
  vendorApiOnboardingFee: 400,
};

// Mutually exclusive module pairs for 2026
export const MUTUALLY_EXCLUSIVE_2026: [string, string][] = [
  ["smartAlerting", "liveMonitoring"],
];

export const isPackage2026 = (packageType: string): boolean => {
  return packageType === "ammp_os_2026";
};

export const isSolarAfricaPackage = (packageType: string): boolean => {
  return packageType === "solar_africa_api";
};

export const isSpsPackage = (packageType: string): boolean => {
  return packageType === "sps_monitoring";
};

export const isMatriarchApiPackage = (packageType: string): boolean => {
  return packageType === "matriarch_api";
};

// === Matriarch API Pricing ===

export interface IrradianceSiteTier {
  minQuantity: number;
  maxQuantity: number | null;
  pricePerSite: number;
  label: string;
}

export interface PerformanceMWpTier {
  minMW: number;
  maxMW: number | null;
  pricePerMWp: number;
  label: string;
}

export const MATRIARCH_IRRADIANCE_SITE_TIERS: IrradianceSiteTier[] = [
  { minQuantity: 1, maxQuantity: 99, pricePerSite: 5, label: "1-99 sites" },
  { minQuantity: 100, maxQuantity: 499, pricePerSite: 4.5, label: "100-499 sites" },
  { minQuantity: 500, maxQuantity: 999, pricePerSite: 4, label: "500-999 sites" },
];

export const MATRIARCH_PERFORMANCE_MWP_TIERS: PerformanceMWpTier[] = [
  { minMW: 0, maxMW: 25, pricePerMWp: 316, label: "0-25 MWp" },
  { minMW: 25, maxMW: 75, pricePerMWp: 300, label: "25-75 MWp" },
  { minMW: 75, maxMW: 150, pricePerMWp: 284, label: "75-150 MWp" },
  { minMW: 150, maxMW: 300, pricePerMWp: 266, label: "150-300 MWp" },
];

export const MATRIARCH_ONBOARDING_FEE = 2650;
export const MATRIARCH_VENDOR_API_FEE = 350;

/**
 * Get applicable irradiance site tier rate
 */
export function getIrradianceSiteTierRate(
  siteCount: number,
  tiers?: IrradianceSiteTier[]
): number {
  const activeTiers = tiers || MATRIARCH_IRRADIANCE_SITE_TIERS;
  const tier = activeTiers.find(t => 
    siteCount >= t.minQuantity && 
    (t.maxQuantity === null || siteCount <= t.maxQuantity)
  );
  return tier?.pricePerSite || activeTiers[activeTiers.length - 1].pricePerSite;
}

/**
 * Calculate graduated performance MWp pricing (like elum_internal but for performance sites)
 */
export function calculatePerformanceMWpCost(
  totalMWp: number,
  tiers?: PerformanceMWpTier[]
): { totalCost: number; tierBreakdown: Array<{ label: string; mwInTier: number; pricePerMWp: number; cost: number }> } {
  const activeTiers = tiers || MATRIARCH_PERFORMANCE_MWP_TIERS;
  const tierBreakdown: Array<{ label: string; mwInTier: number; pricePerMWp: number; cost: number }> = [];
  let remainingMW = totalMWp;

  for (const tier of activeTiers) {
    if (remainingMW <= 0) break;
    const tierCapacity = tier.maxMW !== null ? tier.maxMW - tier.minMW : remainingMW;
    const mwInTier = Math.min(remainingMW, tierCapacity);
    const cost = mwInTier * tier.pricePerMWp;
    tierBreakdown.push({ label: tier.label, mwInTier, pricePerMWp: tier.pricePerMWp, cost });
    remainingMW -= mwInTier;
  }

  return {
    totalCost: tierBreakdown.reduce((s, t) => s + t.cost, 0),
    tierBreakdown,
  };
}

// SPS Monitoring volume discount tiers (5% per 50 MW, max 30%)
export const SPS_DEFAULT_VOLUME_DISCOUNT_TIERS: DiscountTier[] = [
  { minMW: 0, maxMW: 49.99, discountPercent: 0, label: "0-49 MW" },
  { minMW: 50, maxMW: 99.99, discountPercent: 5, label: "50-99 MW" },
  { minMW: 100, maxMW: 149.99, discountPercent: 10, label: "100-149 MW" },
  { minMW: 150, maxMW: 199.99, discountPercent: 15, label: "150-199 MW" },
  { minMW: 200, maxMW: 249.99, discountPercent: 20, label: "200-249 MW" },
  { minMW: 250, maxMW: 299.99, discountPercent: 25, label: "250-299 MW" },
  { minMW: 300, maxMW: null, discountPercent: 30, label: "300+ MW" },
];

// SPS-specific addon definitions (adjusted prices from standard)
export const SPS_ADDONS: AddonDefinition[] = [
  {
    id: "sps_platformCustomization",
    name: "Platform Customization Work",
    price: 110, // per hour
  },
  {
    id: "sps_customDashboard",
    name: "Custom Dashboard",
    price: 900,
  },
  {
    id: "sps_customReport",
    name: "Custom Report",
    price: 1350,
  },
  {
    id: "sps_customAlerts",
    name: "Custom Alerts",
    price: 135,
  },
  {
    id: "satelliteDataAPI",
    name: "Satellite Data API Access",
    tieredPricing: true,
    autoActivateFromAMMP: true,
    ammpSourceField: "sitesWithSolcast",
    pricingTiers: [
      { minQuantity: 0, maxQuantity: 99, pricePerUnit: 2.7, label: "0-99 sites" },
      { minQuantity: 100, maxQuantity: 499, pricePerUnit: 2, label: "100-499 sites" },
      { minQuantity: 500, maxQuantity: 999, pricePerUnit: 1.5, label: "500-999 sites" },
      { minQuantity: 1000, maxQuantity: null, pricePerUnit: 1, label: "1000+ sites" },
    ],
  },
  {
    id: "sps_vendorApiOnboarding",
    name: "Vendor API Onboarding",
    price: 350,
  },
  {
    id: "sps_customApiIntegration",
    name: "Custom API Integration",
    price: 3150,
  },
];

export const getModule2026ById = (id: string): ModuleDefinition | undefined => {
  return MODULES_2026.find(m => m.id === id);
};

export const getAddon2026ById = (id: string): AddonDefinition | undefined => {
  return ADDONS_2026.find(a => a.id === id);
};

// Per-site pricing defaults (for UNHCR-style contracts)
export const DEFAULT_PER_SITE_PRICING = {
  onboardingFeePerSite: 1000,  // One-off setup cost per site
  annualFeePerSite: 1000       // Annual subscription per site
};
export type BillingFrequency = "monthly" | "quarterly" | "biannual" | "annual";
export type ComplexityLevel = "low" | "medium" | "high";
export type SiteChargeFrequency = "monthly" | "annual";

// Helper functions
export const getModuleById = (id: string): ModuleDefinition | undefined => {
  return MODULES.find(m => m.id === id);
};

export const getAddonById = (id: string): AddonDefinition | undefined => {
  return ADDONS.find(a => a.id === id);
};

// Deprecated: Addons are now independent of modules
// export const getAddonsByModule = (moduleId: string): AddonDefinition[] => {
//   return ADDONS.filter(a => a.module === moduleId);
// };

export const getAddonPrice = (
  addon: AddonDefinition, 
  complexity?: ComplexityLevel,
  customPrice?: number
): number => {
  // Custom price override
  if (customPrice !== undefined) return customPrice;
  
  // Complexity-based pricing
  if (addon.complexityPricing && complexity) {
    if (complexity === 'low' && addon.lowPrice !== undefined) return addon.lowPrice;
    if (complexity === 'medium' && addon.mediumPrice !== undefined) return addon.mediumPrice;
    if (complexity === 'high' && addon.highPrice !== undefined) return addon.highPrice;
  }
  
  // Fixed price
  return addon.price || 0;
};

export const calculateTieredPrice = (
  addon: AddonDefinition,
  quantity: number,
  customTiers?: PricingTier[]
): { pricePerUnit: number; totalPrice: number; appliedTier: PricingTier | null } => {
  if (!addon.tieredPricing || !addon.pricingTiers) {
    return {
      pricePerUnit: addon.price || 0,
      totalPrice: (addon.price || 0) * quantity,
      appliedTier: null
    };
  }

  const tiers = customTiers || addon.pricingTiers;
  const appliedTier = tiers.find(tier => 
    quantity >= tier.minQuantity && 
    (tier.maxQuantity === null || quantity <= tier.maxQuantity)
  );

  if (!appliedTier) {
    // Fallback to highest tier
    const highestTier = tiers[tiers.length - 1];
    return {
      pricePerUnit: highestTier.pricePerUnit,
      totalPrice: highestTier.pricePerUnit * quantity,
      appliedTier: highestTier
    };
  }

  return {
    pricePerUnit: appliedTier.pricePerUnit,
    totalPrice: appliedTier.pricePerUnit * quantity,
    appliedTier
  };
};

// === Elum 2026 org-based tiers ===
// Contract: Elum <> AMMP 2026. Pricing is per Organisation (sub-org of the Elum
// parent org), classified by AMMP feature flags:
//   epm_lite -> C&I Lite, epm_pro -> C&I Pro, epm_utility -> Utility,
//   elum_internal -> Internal
//   remote_econf -> org-wide eConf add-on (billable on Lite only; bundled in Pro/Utility)

export type ElumOrgTier = "ci_lite" | "ci_pro" | "utility" | "internal";

export const ELUM_TIER_FLAGS: Record<ElumOrgTier, string> = {
  ci_lite: "epm_lite",
  ci_pro: "epm_pro",
  utility: "epm_utility",
  internal: "elum_internal",
};

export const ELUM_TIER_LABELS: Record<ElumOrgTier, string> = {
  ci_lite: "C&I Lite",
  ci_pro: "C&I Pro",
  utility: "Utility",
  internal: "Internal",
};

export const ELUM_ECONF_FLAG = "remote_econf";

/** C&I Lite: €/MWp/year on the org portfolio. */
export const ELUM_LITE_BASE_RATE = 65;
/** C&I Lite: org-wide remote eConf add-on, €/MWp/year on ALL sites in the org. */
export const ELUM_LITE_ECONF_RATE = 335;

export interface ElumInternalBracket {
  /** inclusive lower bound in MWp */
  minMWp: number;
  /** upper bound in MWp, null = no limit */
  maxMWp: number | null;
  pricePerMWp: number;
  label: string;
}

/**
 * Internal 2026: stepped brackets on the org portfolio. Each bracket's rate
 * applies only to the MWp that falls inside that bracket.
 */
export const ELUM_INTERNAL_2026_BRACKETS: ElumInternalBracket[] = [
  { minMWp: 0, maxMWp: 100, pricePerMWp: 150, label: "First 100 MWp" },
  { minMWp: 100, maxMWp: 500, pricePerMWp: 75, label: "100-500 MWp" },
  { minMWp: 500, maxMWp: null, pricePerMWp: 37.5, label: "Beyond 500 MWp" },
];

/**
 * Internal 2026 supports eConf. No separate charge has been agreed yet, so the
 * add-on defaults to 0 €/MWp; override per contract via org_pricing_config.
 */
export const ELUM_INTERNAL_2026_ECONF_RATE = 0;

/** Stepped bracket cost for the Internal tier. */
export function calculateElumInternalSteppedCost(
  totalMWp: number,
  brackets: ElumInternalBracket[] = ELUM_INTERNAL_2026_BRACKETS
): { totalCost: number; brackets: Array<{ label: string; mwInBracket: number; pricePerMWp: number; cost: number }> } {
  const lines: Array<{ label: string; mwInBracket: number; pricePerMWp: number; cost: number }> = [];
  let totalCost = 0;

  for (const bracket of brackets) {
    const upper = bracket.maxMWp ?? Infinity;
    const mwInBracket = Math.max(0, Math.min(totalMWp, upper) - bracket.minMWp);
    if (mwInBracket <= 0) continue;
    const cost = mwInBracket * bracket.pricePerMWp;
    totalCost += cost;
    lines.push({
      label: bracket.label,
      mwInBracket,
      pricePerMWp: bracket.pricePerMWp,
      cost,
    });
  }

  return { totalCost, brackets: lines };
}

export interface ElumProSiteBucket {
  /** inclusive lower bound in MWp */
  minMWp: number;
  /** exclusive upper bound in MWp, null = no limit */
  maxMWp: number | null;
  pricePerMWp: number;
  label: string;
}

/** C&I Pro: price applied site by site, never aggregated. */
export const ELUM_PRO_SITE_BUCKETS: ElumProSiteBucket[] = [
  { minMWp: 0, maxMWp: 1, pricePerMWp: 650, label: "Up to 1 MWp" },
  { minMWp: 1, maxMWp: 2, pricePerMWp: 450, label: "1 to 2 MWp" },
  { minMWp: 2, maxMWp: null, pricePerMWp: 300, label: "2 MWp and above" },
];

export function getElumProBucket(mwp: number): ElumProSiteBucket {
  // up to 1 MWp inclusive, >1 and <2, then 2 and above
  if (mwp <= 1) return ELUM_PRO_SITE_BUCKETS[0];
  if (mwp < 2) return ELUM_PRO_SITE_BUCKETS[1];
  return ELUM_PRO_SITE_BUCKETS[2];
}

export interface ElumUtilityTier {
  minMWp: number;
  maxMWp: number | null;
  discountPercent: number;
  pricePerMWp: number;
  label: string;
}

/** Utility: single blended rate determined by total org portfolio size. */
export const ELUM_UTILITY_TIERS: ElumUtilityTier[] = [
  { minMWp: 0, maxMWp: 10, discountPercent: 0, pricePerMWp: 300, label: "Under 10 MWp" },
  { minMWp: 10, maxMWp: 20, discountPercent: 5, pricePerMWp: 285, label: "10-20 MWp" },
  { minMWp: 20, maxMWp: 30, discountPercent: 10, pricePerMWp: 270, label: "20-30 MWp" },
  { minMWp: 30, maxMWp: 40, discountPercent: 15, pricePerMWp: 255, label: "30-40 MWp" },
  { minMWp: 40, maxMWp: 50, discountPercent: 20, pricePerMWp: 240, label: "40-50 MWp" },
  { minMWp: 50, maxMWp: null, discountPercent: 25, pricePerMWp: 225, label: "50 MWp and above" },
];

export function getElumUtilityTier(portfolioMWp: number): ElumUtilityTier {
  return (
    ELUM_UTILITY_TIERS.find(t => portfolioMWp < (t.maxMWp ?? Infinity) && portfolioMWp >= t.minMWp) ||
    ELUM_UTILITY_TIERS[ELUM_UTILITY_TIERS.length - 1]
  );
}

/** Utility tier requires every site in the org to be > 2 MWp. */
export const ELUM_UTILITY_MIN_SITE_MWP = 2;

/** Combined yearly minimum across all Elum contracts (contract clause). */
export const ELUM_COMBINED_ANNUAL_MINIMUM = 80000;

export const isElumOrgTierPackage = (packageType: string): boolean =>
  packageType === "elum_ci_lite" ||
  packageType === "elum_ci_pro" ||
  packageType === "elum_utility" ||
  packageType === "elum_internal_2026";

export const elumTierForPackage = (packageType: string): ElumOrgTier | null => {
  if (packageType === "elum_ci_lite") return "ci_lite";
  if (packageType === "elum_ci_pro") return "ci_pro";
  if (packageType === "elum_utility") return "utility";
  if (packageType === "elum_internal_2026") return "internal";
  return null;
};

// === Enterprise eConf (asset-group based) ===
// Same shape as C&I Lite pricing (base €/MWp on the portfolio + eConf add-on
// charged on every MWp of the eConf segment), but resolved purely from AMMP
// asset groups — the primary group defines the portfolio, the AND group marks
// the eConf upgrade, the NOT group excludes sites. No sub-org discovery.

/** Enterprise eConf: base rate €/MWp/year (Annex C default). */
export const ENTERPRISE_ECONF_BASE_RATE = 650;
/** Enterprise eConf: eConf upgrade add-on €/MWp/year on top of the base rate. */
export const ENTERPRISE_ECONF_ECONF_RATE = 150;
/** Enterprise eConf: default minimum annual value. */
export const ENTERPRISE_ECONF_MIN_ANNUAL_VALUE = 5000;
/** Enterprise eConf: default one-time onboarding fee. */
export const ENTERPRISE_ECONF_ONBOARDING_FEE = 1075;

export const isEnterpriseEconfPackage = (packageType: string): boolean =>
  packageType === "enterprise_econf";

/** Packages whose invoice detail is rendered from the per-org/segment breakdown. */
export const usesOrgTierBreakdown = (packageType: string): boolean =>
  isElumOrgTierPackage(packageType) || isEnterpriseEconfPackage(packageType);


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
  | "elum_internal";

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

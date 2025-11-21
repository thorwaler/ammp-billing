// Shared pricing data for modules and addons
// Single source of truth for both contract creation and invoice calculation

export interface ModuleDefinition {
  id: string;
  name: string;
  price: number;
  available: boolean;
  trial?: boolean;
}

export interface AddonDefinition {
  id: string;
  name: string;
  price?: number;
  complexityPricing?: boolean;
  lowPrice?: number;
  mediumPrice?: number;
  highPrice?: number;
  requiresPro?: boolean;
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
    price: 6 
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
export type PackageType = "starter" | "pro" | "custom" | "hybrid_tiered";
export type BillingFrequency = "monthly" | "quarterly" | "biannual" | "annual";
export type ComplexityLevel = "low" | "medium" | "high";

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

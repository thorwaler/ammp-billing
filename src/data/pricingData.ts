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
  module: string;
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
  // Technical Monitoring Addons
  { 
    id: "customKPIs", 
    name: "Custom KPIs", 
    module: "technicalMonitoring", 
    complexityPricing: true,
    lowPrice: 200,
    mediumPrice: 1500,
    highPrice: 10000
  },
  { 
    id: "customAPIIntegration", 
    name: "Custom API Integration", 
    module: "technicalMonitoring", 
    price: 3500 
  },
  { 
    id: "satelliteDataAPI", 
    name: "Satellite Data API Access", 
    module: "technicalMonitoring", 
    price: 6 
  },
  { 
    id: "dataLoggerSetup", 
    name: "Data Logger Setup", 
    module: "technicalMonitoring", 
    complexityPricing: true,
    lowPrice: 1000,
    mediumPrice: 2500,
    highPrice: 5000
  },
  { 
    id: "tmCustomDashboards", 
    name: "Custom Dashboards", 
    module: "technicalMonitoring", 
    price: 1000,
    requiresPro: true
  },
  { 
    id: "tmCustomReports", 
    name: "Custom Reports", 
    module: "technicalMonitoring", 
    price: 1500,
    requiresPro: true
  },
  { 
    id: "tmCustomAlerts", 
    name: "Custom Alerts", 
    module: "technicalMonitoring", 
    price: 150,
    requiresPro: true
  },
  
  // Energy Savings Hub Addons
  { 
    id: "eshCustomDashboard", 
    name: "Custom Dashboard", 
    module: "energySavingsHub", 
    price: 1000 
  },
  { 
    id: "eshCustomReport", 
    name: "Custom Report", 
    module: "energySavingsHub", 
    price: 1500 
  },
  { 
    id: "eshCustomKPIs", 
    name: "Custom KPIs", 
    module: "energySavingsHub", 
    complexityPricing: true,
    lowPrice: 200,
    mediumPrice: 1500,
    highPrice: 10000
  },
  
  // Stakeholder Portal Addons
  { 
    id: "spCustomDashboard", 
    name: "Custom Dashboard", 
    module: "stakeholderPortal", 
    price: 1000 
  },
  { 
    id: "spCustomReport", 
    name: "Custom Report", 
    module: "stakeholderPortal", 
    price: 1500 
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

export const getAddonsByModule = (moduleId: string): AddonDefinition[] => {
  return ADDONS.filter(a => a.module === moduleId);
};

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

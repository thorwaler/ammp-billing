// Shared UI component for package, module, and addon selection
// Used by both ContractForm and InvoiceCalculator

import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  MODULES, 
  ADDONS, 
  type ModuleDefinition, 
  type AddonDefinition, 
  type ComplexityLevel, 
  type PricingTier, 
  type DeliverableType,
  calculateTieredPrice 
} from "@/data/pricingData";
import { TierPricingEditor } from "./TierPricingEditor";
import { AlertTriangle } from "lucide-react";

export interface PackageSelectorProps {
  // Package and module selections
  selectedPackage: string;
  selectedModules: string[];
  selectedAddons: string[];
  
  // Addon metadata
  addonComplexity: { [key: string]: ComplexityLevel };
  addonCustomPrices: { [key: string]: number | undefined };
  addonQuantities: { [key: string]: number | undefined };
  addonCustomTiers?: Record<string, PricingTier[]>;
  
  // Custom pricing
  customPricing?: { [key: string]: number | undefined };
  showCustomPricing?: boolean;
  
  // Callbacks
  onModuleToggle: (moduleId: string) => void;
  onModuleCustomPriceChange?: (moduleId: string, price: number | undefined) => void;
  onAddonToggle: (addonId: string) => void;
  onComplexityChange: (addonId: string, complexity: ComplexityLevel) => void;
  onCustomPriceChange: (addonId: string, price: number | undefined) => void;
  onQuantityChange: (addonId: string, quantity: number) => void;
  onCustomTiersChange?: (addonId: string, tiers: PricingTier[]) => void;
  onDeliverableTypeChange?: (addonId: string, type: DeliverableType) => void;
  
  // 2026 support
  modules?: ModuleDefinition[];
  addons?: AddonDefinition[];
  mutuallyExclusiveModules?: [string, string][];
  addonDeliverableTypes?: Record<string, DeliverableType>;
  
  // Display options
  currency?: 'USD' | 'EUR';
  mode?: 'contract' | 'invoice';
  
  // Render helpers (for react-hook-form integration)
  renderModuleInput?: (moduleId: string) => React.ReactNode;
}

export function ContractPackageSelector({
  selectedPackage,
  selectedModules,
  selectedAddons,
  addonComplexity,
  addonCustomPrices,
  addonQuantities,
  addonCustomTiers,
  customPricing,
  showCustomPricing,
  onModuleToggle,
  onModuleCustomPriceChange,
  onAddonToggle,
  onComplexityChange,
  onCustomPriceChange,
  onQuantityChange,
  onCustomTiersChange,
  onDeliverableTypeChange,
  modules: modulesProp,
  addons: addonsProp,
  mutuallyExclusiveModules,
  addonDeliverableTypes,
  currency = 'EUR',
  mode = 'contract',
  renderModuleInput,
}: PackageSelectorProps) {
  const currencySymbol = currency === 'USD' ? '$' : '€';
  const activeModules = modulesProp || MODULES;
  const activeAddons = addonsProp || ADDONS;
  
  // Check if a module is disabled due to mutual exclusivity
  const getMutuallyExclusivePartner = (moduleId: string): string | null => {
    if (!mutuallyExclusiveModules) return null;
    for (const [a, b] of mutuallyExclusiveModules) {
      if (moduleId === a && selectedModules.includes(b)) return b;
      if (moduleId === b && selectedModules.includes(a)) return a;
    }
    return null;
  };
  
  return (
    <div className="space-y-6">
      {/* Modules Section */}
      <div>
        <Label>Modules</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
        {activeModules.map((module) => {
            const isHybridTiered = selectedPackage === "hybrid_tiered" || selectedPackage === "hybrid_tiered_assetgroups";
            const exclusivePartner = getMutuallyExclusivePartner(module.id);
            const isDisabled = 
              (selectedPackage === "starter" && module.id !== "technicalMonitoring") ||
              (isHybridTiered && module.id === "technicalMonitoring");
            
            const isSelected = selectedModules.includes(module.id);
            const partnerModule = exclusivePartner 
              ? activeModules.find(m => m.id === exclusivePartner)
              : null;
            
            return (
              <div 
                key={module.id} 
                className={`border rounded-md p-3 ${isDisabled ? "opacity-50" : ""} ${exclusivePartner ? "border-amber-300/50" : ""}`}
              >
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id={`module-${module.id}`} 
                    checked={isSelected}
                    onCheckedChange={() => onModuleToggle(module.id)}
                    disabled={isDisabled}
                  />
                  <label 
                    htmlFor={`module-${module.id}`}
                    className="flex-grow font-medium cursor-pointer text-sm"
                  >
                    {module.name}
                  </label>
                  <span className="text-sm">
                    {currencySymbol}{module.price}/MWp/year
                    {module.trial && " (6 months free trial)"}
                  </span>
                </div>
                
                {/* Mutual exclusivity warning */}
                {exclusivePartner && partnerModule && (
                  <div className="mt-1 pl-6 flex items-center gap-1 text-xs text-amber-600">
                    <AlertTriangle className="h-3 w-3" />
                    <span>Selecting this will deselect {partnerModule.name}</span>
                  </div>
                )}
                
                {/* Custom pricing input for selected modules */}
                {isSelected && (showCustomPricing || mode === 'contract') && (
                  <div className="mt-2 pl-6">
                    <Label htmlFor={`custom-${module.id}`} className="text-xs">
                      {showCustomPricing ? "Custom Price" : "Override Price"} ({currencySymbol}/MWp/year)
                    </Label>
                    {renderModuleInput ? (
                      renderModuleInput(module.id)
                    ) : (
                      <Input 
                        id={`custom-${module.id}`} 
                        type="number" 
                        placeholder={`Default: ${currencySymbol}${module.price}`}
                        className="mt-1 h-8"
                        value={customPricing?.[module.id] || ''}
                        onChange={(e) => {
                          const value = e.target.value ? Number(e.target.value) : undefined;
                          onModuleCustomPriceChange?.(module.id, value);
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Addons Section */}
      <div>
        <Label>Add-ons</Label>
        <div className="grid grid-cols-1 gap-3 mt-2">
          {activeAddons
            .filter(addon => !addon.requiresPro || selectedPackage !== "starter")
            .map(addon => {
              const isSelected = selectedAddons.includes(addon.id);
              const isAddonDisabled = addon.requiresPro && selectedPackage === "starter";
              
              return (
                <div 
                  key={addon.id} 
                  className={`border rounded-md p-3 ${isAddonDisabled ? "opacity-50" : ""}`}
                >
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id={`addon-${addon.id}`} 
                      checked={isSelected}
                      onCheckedChange={() => onAddonToggle(addon.id)}
                      disabled={isAddonDisabled}
                    />
                    <label 
                      htmlFor={`addon-${addon.id}`}
                      className="flex-grow cursor-pointer text-sm"
                    >
                      {addon.name}
                    </label>
                          <span className="text-sm">
                            {addon.tieredPricing && addon.pricingTiers ? (
                              <span className="text-xs">
                                €{addon.pricingTiers[0].pricePerUnit}-€{addon.pricingTiers[addon.pricingTiers.length - 1].pricePerUnit}/site
                              </span>
                            ) : addon.complexityPricing ? (
                              `${currencySymbol}${addon.lowPrice} - ${currencySymbol}${addon.highPrice}`
                            ) : (
                              `${currencySymbol}${addon.price}`
                            )}
                          </span>
                  </div>
                  
                  {/* Deliverable type sub-selector for customDashboardReportAlerts */}
                  {isSelected && addon.id === 'customDashboardReportAlerts' && !isAddonDisabled && (
                    <div className="mt-2 pl-6 space-y-2">
                      <Label className="text-xs">Deliverable Type</Label>
                      <RadioGroup
                        value={addonDeliverableTypes?.[addon.id] || "dashboard"}
                        onValueChange={(value) => onDeliverableTypeChange?.(addon.id, value as DeliverableType)}
                        className="flex flex-col space-y-1"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="dashboard" id="deliverable-dashboard" />
                          <label htmlFor="deliverable-dashboard" className="text-sm cursor-pointer">Custom Dashboard</label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="report" id="deliverable-report" />
                          <label htmlFor="deliverable-report" className="text-sm cursor-pointer">Custom Report</label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="10_alerts" id="deliverable-alerts" />
                          <label htmlFor="deliverable-alerts" className="text-sm cursor-pointer">10 Custom Alerts</label>
                        </div>
                      </RadioGroup>
                    </div>
                  )}
                  
                  {/* Complexity selector for selected addons with complexity pricing */}
                  {isSelected && addon.complexityPricing && !isAddonDisabled && (
                    <div className="mt-2 pl-6 space-y-2">
                      <div>
                        <Label className="text-xs">Complexity</Label>
                        <Select 
                          value={addonComplexity[addon.id] || "low"} 
                          onValueChange={(value) => onComplexityChange(addon.id, value as ComplexityLevel)}
                        >
                          <SelectTrigger className="h-8 mt-1">
                            <SelectValue placeholder="Select complexity" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">Low ({currencySymbol}{addon.lowPrice})</SelectItem>
                            <SelectItem value="medium">Medium ({currencySymbol}{addon.mediumPrice})</SelectItem>
                            <SelectItem value="high">High ({currencySymbol}{addon.highPrice})</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                  
                  {/* Tiered pricing editor - ONLY FOR SATELLITE DATA API */}
                  {isSelected && 
                   addon.id === 'satelliteDataAPI' && 
                   addon.tieredPricing && 
                   addon.pricingTiers && 
                   !isAddonDisabled && (
                    <div className="mt-2 pl-6 space-y-2">
                      <TierPricingEditor
                        tiers={addonCustomTiers?.[addon.id] || addon.pricingTiers}
                        onTiersChange={(newTiers) => onCustomTiersChange?.(addon.id, newTiers)}
                        currentQuantity={addonQuantities[addon.id]}
                        currencySymbol={currencySymbol}
                      />
                      
                      {/* Show calculated total */}
                      {addonQuantities[addon.id] > 0 && (() => {
                        const pricing = calculateTieredPrice(
                          addon,
                          addonQuantities[addon.id],
                          addonCustomTiers?.[addon.id]
                        );
                        return (
                          <div className="text-xs bg-primary/5 p-2 rounded font-medium border border-primary/10">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Calculated Total:</span>
                              <span className="text-primary">
                                {currencySymbol}{pricing.totalPrice.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                  
                  {/* Custom price and quantity inputs for selected addons */}
                  {isSelected && !isAddonDisabled && (
                    <div className="mt-2 pl-6 grid grid-cols-2 gap-2">
                      {!addon.tieredPricing && (
                        <div>
                          <Label htmlFor={`addon-price-${addon.id}`} className="text-xs">
                            Custom Price (optional)
                          </Label>
                          <Input 
                            id={`addon-price-${addon.id}`} 
                            type="number" 
                            placeholder="Override"
                            className="mt-1 h-8"
                            value={addonCustomPrices[addon.id] || ''}
                            onChange={(e) => {
                              const value = e.target.value ? Number(e.target.value) : undefined;
                              onCustomPriceChange(addon.id, value);
                            }}
                          />
                        </div>
                      )}
                      <div className={addon.tieredPricing ? "col-span-2" : ""}>
                        <Label htmlFor={`addon-qty-${addon.id}`} className="text-xs">
                          Quantity
                        </Label>
                        <Input 
                          id={`addon-qty-${addon.id}`} 
                          type="number" 
                          min="1"
                          placeholder="1"
                          className="mt-1 h-8"
                          value={addonQuantities[addon.id] || 1}
                          onChange={(e) => {
                            const value = e.target.value ? Number(e.target.value) : 1;
                            onQuantityChange(addon.id, value);
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

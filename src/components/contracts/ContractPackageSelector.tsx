// Shared UI component for package, module, and addon selection
// Used by both ContractForm and InvoiceCalculator

import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MODULES, ADDONS, type ComplexityLevel } from "@/data/pricingData";

export interface PackageSelectorProps {
  // Package and module selections
  selectedPackage: string;
  selectedModules: string[];
  selectedAddons: string[];
  
  // Addon metadata
  addonComplexity: { [key: string]: ComplexityLevel };
  addonCustomPrices: { [key: string]: number | undefined };
  addonQuantities: { [key: string]: number | undefined };
  
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
  customPricing,
  showCustomPricing,
  onModuleToggle,
  onModuleCustomPriceChange,
  onAddonToggle,
  onComplexityChange,
  onCustomPriceChange,
  onQuantityChange,
  currency = 'EUR',
  mode = 'contract',
  renderModuleInput,
}: PackageSelectorProps) {
  const currencySymbol = currency === 'USD' ? '$' : '€';
  
  return (
    <div className="space-y-6">
      {/* Modules Section */}
      <div>
        <Label>Modules</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
          {MODULES.map((module) => {
            const isDisabled = 
              (selectedPackage === "starter" && module.id !== "technicalMonitoring") ||
              (selectedPackage === "hybrid_tiered" && module.id === "technicalMonitoring");
            
            const isSelected = selectedModules.includes(module.id);
            
            return (
              <div 
                key={module.id} 
                className={`border rounded-md p-3 ${isDisabled ? "opacity-50" : ""}`}
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
          {ADDONS
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
                      {addon.complexityPricing ? 
                        `${currencySymbol}${addon.lowPrice} - ${currencySymbol}${addon.highPrice}` : 
                        `${currencySymbol}${addon.price}`}
                    </span>
                  </div>
                  
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
                  
                  {/* Custom price and quantity inputs for selected addons */}
                  {isSelected && !isAddonDisabled && (
                    <div className="mt-2 pl-6 grid grid-cols-2 gap-2">
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
                      <div>
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

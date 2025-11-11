
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "@/hooks/use-toast";
import { FileUp, Save } from "lucide-react";

// Define the form schema
const contractFormSchema = z.object({
  companyName: z.string().min(2, { message: "Company name is required" }),
  initialMW: z.coerce.number().min(0, { message: "Initial MW is required" }),
  package: z.enum(["starter", "pro", "custom"]),
  modules: z.array(z.string()).optional(),
  addons: z.array(z.string()).optional(),
  customPricing: z.object({
    technicalMonitoring: z.coerce.number().optional(),
    energySavingsHub: z.coerce.number().optional(),
    stakeholderPortal: z.coerce.number().optional(),
    control: z.coerce.number().optional(),
  }).optional(),
  minimumCharge: z.coerce.number().optional(),
  notes: z.string().optional(),
});

type ContractFormValues = z.infer<typeof contractFormSchema>;

const modules = [
  { id: "technicalMonitoring", name: "Technical Monitoring", price: 1000, available: true },
  { id: "energySavingsHub", name: "Energy Savings Hub", price: 500, available: true, trial: true },
  { id: "stakeholderPortal", name: "Stakeholder Portal", price: 250, available: true, trial: true },
  { id: "control", name: "Control", price: 500, available: true, trial: true },
];

const addons = [
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

export function ContractForm() {
  const [selectedPackage, setSelectedPackage] = useState("");
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [showCustomPricing, setShowCustomPricing] = useState(false);
  const [selectedComplexityItems, setSelectedComplexityItems] = useState<{[key: string]: string}>({});

  const form = useForm<ContractFormValues>({
    resolver: zodResolver(contractFormSchema),
    defaultValues: {
      companyName: "",
      initialMW: 0,
      package: "pro" as const,
      modules: ["technicalMonitoring"],
      addons: [],
      customPricing: {
        technicalMonitoring: undefined,
        energySavingsHub: undefined,
        stakeholderPortal: undefined,
        control: undefined,
      },
      minimumCharge: 0,
      notes: "",
    },
  });

  const watchPackage = form.watch("package");
  const watchModules = form.watch("modules");
  const watchAddons = form.watch("addons");

  // Handle package change
  const handlePackageChange = (value: string) => {
    setSelectedPackage(value);
    
    if (value === "starter") {
      // Starter package only includes Technical Monitoring
      form.setValue("modules", ["technicalMonitoring"]);
    } else if (value === "custom") {
      setShowCustomPricing(true);
    } else {
      setShowCustomPricing(false);
    }
  };

  // Handle module selection
  const handleModuleSelection = (moduleId: string, checked: boolean) => {
    const currentModules = form.getValues("modules") || [];
    
    if (checked) {
      form.setValue("modules", [...currentModules, moduleId]);
    } else {
      form.setValue(
        "modules",
        currentModules.filter((id) => id !== moduleId)
      );
      
      // Remove addons associated with this module
      const currentAddons = form.getValues("addons") || [];
      const filteredAddons = currentAddons.filter(
        (addonId) => !addons.find((a) => a.id === addonId && a.module === moduleId)
      );
      form.setValue("addons", filteredAddons);
    }
  };

  // Handle addon selection
  const handleAddonSelection = (addonId: string, checked: boolean) => {
    const currentAddons = form.getValues("addons") || [];
    
    if (checked) {
      form.setValue("addons", [...currentAddons, addonId]);
      
      // If the addon has complexity pricing, open a dialog or show fields to select complexity
      const addon = addons.find(a => a.id === addonId);
      if (addon?.complexityPricing) {
        setSelectedComplexityItems({
          ...selectedComplexityItems,
          [addonId]: "low" // Default to low complexity
        });
      }
    } else {
      form.setValue(
        "addons",
        currentAddons.filter((id) => id !== addonId)
      );
      
      // Clear complexity selection
      if (selectedComplexityItems[addonId]) {
        const newComplexityItems = {...selectedComplexityItems};
        delete newComplexityItems[addonId];
        setSelectedComplexityItems(newComplexityItems);
      }
    }
  };

  // Handle complexity selection for addons
  const handleComplexityChange = (addonId: string, complexity: string) => {
    setSelectedComplexityItems({
      ...selectedComplexityItems,
      [addonId]: complexity
    });
  };

  const onSubmit = (data: ContractFormValues) => {
    console.log("Form submitted", data);
    
    // Include complexity data in the submission
    const enhancedData = {
      ...data,
      addonComplexity: selectedComplexityItems,
    };
    
    toast({
      title: "Contract created",
      description: `Created contract for ${data.companyName}`,
    });
    
    // Reset form
    form.reset();
    setSelectedComplexityItems({});
    setSelectedPackage("");
    setSelectedModules([]);
    setShowCustomPricing(false);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-xl">Create New Contract</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="companyName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter company name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="initialMW"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Initial MW to be Onboarded</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.1" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={form.control}
              name="package"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Package</FormLabel>
                  <Select 
                    onValueChange={(value) => {
                      field.onChange(value);
                      handlePackageChange(value);
                    }} 
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select package" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="starter">AMMP OS Starter (Max 5MW, 20 sites, $3000/year)</SelectItem>
                      <SelectItem value="pro">AMMP OS Pro (Per MW pricing, min $5000/year)</SelectItem>
                      <SelectItem value="custom">Custom/Legacy</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {watchPackage === "starter" ? 
                      "AMMP OS Starter: Max 5MW, max 20 sites, $3000 per year flat fee. Only have access to Technical Monitoring Module." :
                      watchPackage === "pro" ? 
                      "AMMP OS Pro: Pricing per MW based on modules chosen, with a minimum of $5,000 per year." :
                      "Custom/Legacy: Use custom pricing for this customer."}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div>
              <Label>Modules</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                {modules.map((module) => (
                  <div 
                    key={module.id} 
                    className={`border rounded-md p-3 ${
                      watchPackage === "starter" && module.id !== "technicalMonitoring" ? "opacity-50" : ""
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id={`module-${module.id}`} 
                        checked={watchModules?.includes(module.id)} 
                        onCheckedChange={(checked) => handleModuleSelection(module.id, !!checked)}
                        disabled={watchPackage === "starter" && module.id !== "technicalMonitoring"}
                      />
                      <label 
                        htmlFor={`module-${module.id}`}
                        className="flex-grow font-medium cursor-pointer text-sm"
                      >
                        {module.name}
                      </label>
                      <span className="text-sm">
                        ${module.price}/MWp/year
                        {module.trial && " (6 months free trial)"}
                      </span>
                    </div>
                    
                    {watchModules?.includes(module.id) && (
                      <div className="mt-2 pl-6">
                        <Label htmlFor={`custom-${module.id}`} className="text-xs">
                          {showCustomPricing ? "Custom Price ($/MWp/year)" : "Override Price ($/MWp/year)"}
                        </Label>
                        <Input 
                          id={`custom-${module.id}`} 
                          type="number" 
                          placeholder={`Default: $${module.price}`}
                          className="mt-1 h-8"
                          {...form.register(`customPricing.${module.id}` as any, { valueAsNumber: true })}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            
            {/* Addons section - only show addons for selected modules */}
            {watchModules && watchModules.length > 0 && (
              <div>
                <Label>Add-ons</Label>
                <div className="grid grid-cols-1 gap-4 mt-2">
                  {watchModules.map(moduleId => (
                    <div key={moduleId} className="border rounded-md p-4">
                      <h4 className="font-medium mb-2">
                        {modules.find(m => m.id === moduleId)?.name} Add-ons
                      </h4>
                      <div className="space-y-2">
                        {addons
                          .filter(addon => addon.module === moduleId)
                          .filter(addon => !addon.requiresPro || watchPackage !== "starter")
                          .map(addon => (
                            <div 
                              key={addon.id} 
                              className={`${addon.requiresPro && watchPackage === "starter" ? "opacity-50" : ""}`}
                            >
                              <div className="flex items-center space-x-2">
                                <Checkbox 
                                  id={`addon-${addon.id}`} 
                                  checked={watchAddons?.includes(addon.id)}
                                  onCheckedChange={(checked) => handleAddonSelection(addon.id, !!checked)}
                                  disabled={addon.requiresPro && watchPackage === "starter"}
                                />
                                <label 
                                  htmlFor={`addon-${addon.id}`}
                                  className="flex-grow cursor-pointer text-sm"
                                >
                                  {addon.name}
                                </label>
                                <span className="text-sm">
                                  {addon.complexityPricing ? 
                                    `$${addon.lowPrice} - $${addon.highPrice}` : 
                                    `$${addon.price}`}
                                </span>
                              </div>
                              
                              {/* Show complexity selector for selected addons with complexity pricing */}
                              {watchAddons?.includes(addon.id) && addon.complexityPricing && (
                                <div className="mt-2 pl-6">
                                  <Label className="text-xs">Complexity</Label>
                                  <Select 
                                    value={selectedComplexityItems[addon.id] || "low"} 
                                    onValueChange={(value) => handleComplexityChange(addon.id, value)}
                                  >
                                    <SelectTrigger className="h-8 mt-1">
                                      <SelectValue placeholder="Select complexity" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="low">Low (${addon.lowPrice})</SelectItem>
                                      <SelectItem value="medium">Medium (${addon.mediumPrice})</SelectItem>
                                      <SelectItem value="high">High (${addon.highPrice})</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                            </div>
                          ))
                        }
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <FormField
              control={form.control}
              name="minimumCharge"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Minimum Charge per Site</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0" {...field} />
                  </FormControl>
                  <FormDescription>
                    Minimum charge to be applied per site (if applicable)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div>
              <Label>Contract Upload</Label>
              <div className="mt-2">
                <div className="grid w-full max-w-sm items-center gap-1.5">
                  <Label htmlFor="contract-pdf">Upload PDF</Label>
                  <Input id="contract-pdf" type="file" accept=".pdf" />
                </div>
              </div>
            </div>
            
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Additional Notes</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Additional notes about this contract" className="min-h-[100px]" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="flex justify-end space-x-2">
              <Button variant="outline" type="button">
                Cancel
              </Button>
              <Button type="submit">
                <Save className="mr-2 h-4 w-4" />
                Save Contract
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

export default ContractForm;

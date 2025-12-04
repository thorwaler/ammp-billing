
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import CustomerCard from "@/components/customers/CustomerCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlusCircle, Search, Users, RefreshCw, Loader2, AlertCircle, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CustomerForm from "@/components/customers/CustomerForm";
import ContractForm from "@/components/contracts/ContractForm";
import { useCurrency } from "@/contexts/CurrencyContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface CustomerData {
  id: string;
  name: string;
  nickname?: string | null;
  location: string;
  contractValue: number;
  contractCurrency: string;
  mwpManaged: number;
  status: "active" | "pending" | "inactive";
  modules: string[];
  addOns: string[];
  joinDate: string;
  lastInvoiced: string;
  contractId: string;
  contractCount: number;
  contracts: Array<{
    id: string;
    contract_name?: string;
    package: string;
    contract_status: string;
    signed_date?: string;
    period_start?: string;
    period_end?: string;
    company_name?: string;
  }>;
  package?: string;
  ammpOrgId?: string;
  ammpAssetIds?: string[];
  ammpCapabilities?: any;
  lastAmmpSync?: string;
  ammpSyncStatus?: string;
  manualStatusOverride?: boolean;
}


const Customers = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddCustomerForm, setShowAddCustomerForm] = useState(false);
  const [showBulkContractForm, setShowBulkContractForm] = useState(false);
  const [openContractDialogs, setOpenContractDialogs] = useState<{[key: string]: boolean}>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isAmmpSyncing, setIsAmmpSyncing] = useState(false);
  const [customersData, setCustomersData] = useState<CustomerData[]>([]);
  const [filterTab, setFilterTab] = useState("all");
  const [sortField, setSortField] = useState<string>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const navigate = useNavigate();
  const { formatCurrency, convertToDisplayCurrency } = useCurrency();

  // Load customers from database
  const loadCustomers = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

      const { data, error } = await supabase
        .from('customers')
        .select(`
          id,
          name,
          nickname,
          location,
          mwp_managed,
          status,
          join_date,
          last_invoiced,
          manual_status_override,
          ammp_org_id,
          ammp_asset_ids,
          ammp_capabilities,
          last_ammp_sync,
          ammp_sync_status,
          contracts (
            id,
            contract_name,
            package,
            modules,
            addons,
            custom_pricing,
            minimum_annual_value,
            minimum_charge,
            minimum_charge_tiers,
            site_charge_frequency,
            volume_discounts,
            currency,
            contract_status,
            signed_date
          )
        `)
        .eq('user_id', user.id);

    if (error) {
      console.error('Error loading customers:', error);
      return;
    }

        const calculateContractValue = (contract: any, mwpManaged: number, ammpCapabilities?: any) => {
          if (!contract) return 0;
          
          // POC contracts have no billing value
          if (contract.package === 'poc') return 0;
          
          let annualValue = 0;
          let siteCharges = 0;
          
          // Calculate site-based charges if minimum_charge_tiers has chargePerSite > 0
          const minimumChargeTiers = contract.minimum_charge_tiers || [];
          const totalSites = ammpCapabilities?.totalSites || 0;
          const siteChargeFrequency = contract.site_charge_frequency || "annual";
          
          if (minimumChargeTiers.length > 0 && totalSites > 0) {
            // Find applicable tier based on total MW
            const applicableTier = minimumChargeTiers.find((tier: any) => 
              mwpManaged >= tier.minMW && 
              (tier.maxMW === null || mwpManaged <= tier.maxMW)
            );
            
            if (applicableTier && applicableTier.chargePerSite > 0) {
              // Annual site charge calculation based on frequency
              if (siteChargeFrequency === "monthly") {
                // Monthly charge: chargePerSite × totalSites × 12 months
                siteCharges = applicableTier.chargePerSite * totalSites * 12;
              } else {
                // Annual charge: chargePerSite × totalSites
                siteCharges = applicableTier.chargePerSite * totalSites;
              }
            }
          }
          
          if (contract.package === 'starter') {
            // Starter package fixed annual cost
            annualValue = contract.minimum_annual_value || 3000;
          } else if (contract.package === 'hybrid_tiered') {
            // Hybrid tiered package - use per-MWp rates
            const ongridPrice = contract.custom_pricing?.ongrid_per_mwp || 0;
            const hybridPrice = contract.custom_pricing?.hybrid_per_mwp || 0;
            
            // If AMMP capabilities available, use them to split MW
            if (contract.ammp_capabilities?.ongridTotalMW !== undefined && 
                contract.ammp_capabilities?.hybridTotalMW !== undefined) {
              const ongridMW = contract.ammp_capabilities.ongridTotalMW;
              const hybridMW = contract.ammp_capabilities.hybridTotalMW;
              annualValue = (ongridMW * ongridPrice) + (hybridMW * hybridPrice);
            } else {
              // Fallback: treat all MW as ongrid
              annualValue = mwpManaged * ongridPrice;
            }
            
            // Add recurring addons (annual cost)
            const addons = Array.isArray(contract.addons) ? contract.addons : [];
            const recurringAddons = [
              { id: 'satelliteDataAPI', pricePerMW: 6 },
              { id: 'tmCustomDashboards', price: 1000 },
              { id: 'tmCustomReports', price: 1500 },
              { id: 'tmCustomAlerts', price: 150 },
              { id: 'eshCustomDashboard', price: 1000 },
              { id: 'eshCustomReport', price: 1500 },
              { id: 'spCustomDashboard', price: 1000 },
              { id: 'spCustomReport', price: 1500 }
            ];
            
            addons.forEach((addon: any) => {
              const addonId = typeof addon === 'string' ? addon : addon.id;
              const addonConfig = recurringAddons.find(a => a.id === addonId);
              if (addonConfig) {
                if ('pricePerMW' in addonConfig) {
                  annualValue += addonConfig.pricePerMW * mwpManaged;
                } else {
                  annualValue += addonConfig.price;
                }
              }
            });
            
            // Use minimum_annual_value if specified and higher
            const minimumValue = contract.minimum_annual_value || 0;
            annualValue = Math.max(annualValue, minimumValue);
          } else if (contract.package === 'capped') {
            // Capped package - fixed annual fee
            annualValue = contract.minimum_annual_value || 0;
          } else {
            // Pro or Custom package - calculate module costs (annual)
            const defaultPrices: {[key: string]: number} = {
              technicalMonitoring: 1000,
              energySavingsHub: 500,
              stakeholderPortal: 250,
              control: 500
            };
            
            const modules = Array.isArray(contract.modules) ? contract.modules : [];
            const totalPerMwp = modules.reduce((sum: number, moduleId: string) => {
              const customPrice = contract.custom_pricing?.[moduleId];
              return sum + (customPrice || defaultPrices[moduleId] || 0);
            }, 0);
            
            annualValue = totalPerMwp * mwpManaged;
            
            // Add recurring addons (annual cost)
            const addons = Array.isArray(contract.addons) ? contract.addons : [];
            const recurringAddons = [
              { id: 'satelliteDataAPI', pricePerMW: 6 },
              { id: 'tmCustomDashboards', price: 1000 },
              { id: 'tmCustomReports', price: 1500 },
              { id: 'tmCustomAlerts', price: 150 },
              { id: 'eshCustomDashboard', price: 1000 },
              { id: 'eshCustomReport', price: 1500 },
              { id: 'spCustomDashboard', price: 1000 },
              { id: 'spCustomReport', price: 1500 }
            ];
            
            addons.forEach((addon: any) => {
              const addonId = typeof addon === 'string' ? addon : addon.id;
              const addonConfig = recurringAddons.find(a => a.id === addonId);
              if (addonConfig) {
                if ('pricePerMW' in addonConfig) {
                  annualValue += addonConfig.pricePerMW * mwpManaged;
                } else {
                  annualValue += addonConfig.price;
                }
              }
            });
            
            // Compare with minimum annual value and use the higher
            const minimumValue = contract.minimum_annual_value || 
              (contract.package === 'pro' ? 5000 : 0);
            annualValue = Math.max(annualValue, minimumValue);
          }
          
          // Add site charges to the final annual value
          return annualValue + siteCharges;
        };

    const transformed: CustomerData[] = (data || []).map(c => {
      // Filter for active contract only (client-side filtering)
      const activeContract = c.contracts?.find((contract: any) => contract.contract_status === 'active');
      const modules = Array.isArray(activeContract?.modules) ? activeContract.modules as string[] : [];
      const addons = Array.isArray(activeContract?.addons) ? (activeContract.addons as any[]).map((a: any) => a.id || a) : [];
      const mwpManaged = Number(c.mwp_managed) || 0;
      
      // Count total contracts for this customer
      const contractCount = c.contracts?.length || 0;
      
      // Find the earliest contract signed date across ALL contracts
      const firstSignedDate = c.contracts && c.contracts.length > 0
        ? c.contracts
            .map((contract: any) => contract.signed_date)
            .filter((date: string) => date) // Remove nulls
            .sort((a: string, b: string) => new Date(a).getTime() - new Date(b).getTime())[0]
        : null;
      
      return {
        id: c.id,
        name: c.name,
        nickname: c.nickname || null,
        location: c.location || 'N/A',
        contractValue: calculateContractValue(activeContract, mwpManaged, c.ammp_capabilities),
        contractCurrency: activeContract?.currency || 'USD',
        mwpManaged,
        status: (c.status || 'active') as "active" | "pending" | "inactive",
        modules: modules,
        addOns: addons,
        joinDate: firstSignedDate || c.join_date || new Date().toISOString(),
        lastInvoiced: c.last_invoiced || new Date().toISOString(),
        contractId: activeContract?.id || '',
        contractCount,
        contracts: (c.contracts || []).map((contract: any) => ({
          id: contract.id,
          contract_name: contract.contract_name,
          package: contract.package,
          contract_status: contract.contract_status,
          signed_date: contract.signed_date,
          period_start: contract.period_start,
          period_end: contract.period_end,
          company_name: c.name,
        })),
        package: activeContract?.package || undefined,
        ammpOrgId: c.ammp_org_id || undefined,
        ammpAssetIds: (Array.isArray(c.ammp_asset_ids) ? c.ammp_asset_ids : undefined) as string[] | undefined,
        ammpCapabilities: c.ammp_capabilities || undefined,
        lastAmmpSync: c.last_ammp_sync || undefined,
        ammpSyncStatus: c.ammp_sync_status || undefined,
        manualStatusOverride: c.manual_status_override || false,
      };
    });

    // Deduplicate by customer ID
    const deduplicatedMap = new Map<string, CustomerData>();
    transformed.forEach(customer => {
      if (!deduplicatedMap.has(customer.id)) {
        deduplicatedMap.set(customer.id, customer);
      } else {
        console.warn(`[Customers] Duplicate customer detected: ${customer.id} (${customer.name})`);
      }
    });
    const deduplicatedData = Array.from(deduplicatedMap.values());
    
    console.log(`[Customers] Loaded ${transformed.length} rows, ${deduplicatedData.length} unique customers`);
    setCustomersData(deduplicatedData);
  };

  useEffect(() => {
    loadCustomers();
  }, []);
  
  const handleClearAllCustomers = async () => {
    setIsClearing(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('user_id', user.id);
      
      if (error) throw error;
      
      toast({
        title: "Customers cleared",
        description: "All customers have been removed from your database.",
      });
      
      // Reload customers
      await loadCustomers();
    } catch (error) {
      console.error('Error clearing customers:', error);
      toast({
        title: "Clear failed",
        description: error instanceof Error ? error.message : "Failed to clear customers.",
        variant: "destructive",
      });
    } finally {
      setIsClearing(false);
    }
  };

  const handleSyncFromXero = async () => {
    setIsSyncing(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('xero-sync-customers');
      
      if (error) throw error;
      
      const totalSynced = (data.syncedActive || 0) + (data.syncedInactive || 0);
      const details = [];
      
      if (data.syncedActive > 0) details.push(`${data.syncedActive} active`);
      if (data.syncedInactive > 0) details.push(`${data.syncedInactive} archived`);
      if (data.markedInactive > 0) details.push(`${data.markedInactive} deleted`);
      if (data.skippedManualOverride > 0) details.push(`${data.skippedManualOverride} manually managed`);
      if (data.skippedCount > 0) details.push(`${data.skippedCount} suppliers skipped`);
      
      toast({
        title: "✅ Sync complete",
        description: `Synced ${totalSynced} customers from Xero${details.length > 0 ? `: ${details.join(', ')}` : ''}`,
      });
      
      // Reload customers
      await loadCustomers();
    } catch (error) {
      console.error('Error syncing customers:', error);
      toast({
        title: "Sync failed",
        description: error instanceof Error ? error.message : "Please check your Xero connection and try again.",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleBulkAmmpSync = async () => {
    setIsAmmpSyncing(true);
    
    try {
      const customersWithAmmp = customersData.filter(c => c.ammpOrgId);
      
      if (customersWithAmmp.length === 0) {
        toast({
          title: "No AMMP customers",
          description: "No customers have AMMP org IDs configured.",
          variant: "destructive",
        });
        return;
      }
      
      let successCount = 0;
      let failCount = 0;
      const errors: string[] = [];
      
      for (const customer of customersWithAmmp) {
        try {
          const { syncCustomerAMMPData } = await import('@/services/ammp/ammpService');
          await syncCustomerAMMPData(customer.id, customer.ammpOrgId!);
          successCount++;
        } catch (error) {
          failCount++;
          console.error(`Failed to sync ${customer.name}:`, error);
          errors.push(`${customer.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      if (successCount > 0) {
        toast({
          title: "✅ AMMP Sync Complete",
          description: `Successfully synced ${successCount} of ${customersWithAmmp.length} customers${failCount > 0 ? `. ${failCount} failed.` : ''}`,
        });
      }
      
      if (failCount > 0) {
        console.error('AMMP sync errors:', errors);
        toast({
          title: "Some syncs failed",
          description: `${failCount} customers failed to sync. Check console for details.`,
          variant: "destructive",
        });
      }
      
      await loadCustomers();
      
    } catch (error) {
      console.error('Error during bulk AMMP sync:', error);
      toast({
        title: "Bulk sync failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsAmmpSyncing(false);
    }
  };

  const getFilteredCustomers = () => {
    let filtered = customersData;
    
    // Apply tab filter
    if (filterTab === "active") {
      filtered = filtered.filter(c => c.status === "active" && c.contractId);
    } else if (filterTab === "inactive") {
      // Show only customers with inactive status
      filtered = filtered.filter(c => c.status === "inactive");
    } else if (filterTab === "no-contracts") {
      // Show customers that have no contract AND are not inactive
      filtered = filtered.filter(c => !c.contractId && c.status !== "inactive");
    } else if (filterTab === "has-ammp") {
      // Show all customers with AMMP org ID, regardless of sync status
      filtered = filtered.filter(c => c.ammpOrgId);
    } else if (filterTab === "no-ammp") {
      // Show all customers without AMMP org ID
      filtered = filtered.filter(c => !c.ammpOrgId);
    } else if (filterTab === "ammp-synced") {
      // Show only customers with AMMP org ID AND have been synced at least once
      filtered = filtered.filter(c => c.ammpOrgId && c.ammpSyncStatus !== 'never_synced');
    }
    
    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter((customer) =>
        customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.location.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    // Apply sorting
    filtered = [...filtered].sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "contractValue":
          comparison = a.contractValue - b.contractValue;
          break;
        case "mwpManaged":
          comparison = a.mwpManaged - b.mwpManaged;
          break;
        case "joinDate":
          comparison = new Date(a.joinDate).getTime() - new Date(b.joinDate).getTime();
          break;
        case "lastInvoiced":
          comparison = new Date(a.lastInvoiced).getTime() - new Date(b.lastInvoiced).getTime();
          break;
        case "location":
          comparison = a.location.localeCompare(b.location);
          break;
        default:
          comparison = 0;
      }
      
      return sortDirection === "asc" ? comparison : -comparison;
    });
    
    return filtered;
  };

  const filteredCustomers = getFilteredCustomers();
  const customersWithoutContracts = customersData.filter(c => !c.contractId && c.status !== "inactive");

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center">
              <Users className="h-8 w-8 mr-2 text-ammp-blue" />
              Customer & Contract Management
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage customers and their contracts in one place
            </p>
          </div>
          <div className="flex gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={isClearing || customersData.length === 0}>
                  {isClearing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Clearing...
                    </>
                  ) : (
                    'Clear All Customers'
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all {customersData.length} customers from your database. 
                    This action cannot be undone. You can re-sync from Xero afterwards.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearAllCustomers}>
                    Delete All Customers
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button variant="outline" onClick={handleSyncFromXero} disabled={isSyncing}>
              {isSyncing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Sync from Xero
                </>
              )}
            </Button>
            <Button 
              variant="outline" 
              onClick={handleBulkAmmpSync} 
              disabled={isAmmpSyncing || customersData.filter(c => c.ammpOrgId).length === 0}
            >
              {isAmmpSyncing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Syncing AMMP...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Sync All from AMMP ({customersData.filter(c => c.ammpOrgId).length})
                </>
              )}
            </Button>
            <Dialog open={showAddCustomerForm} onOpenChange={setShowAddCustomerForm}>
              <DialogTrigger asChild>
                <Button>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Add Customer
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add New Customer</DialogTitle>
                </DialogHeader>
                <CustomerForm onComplete={() => {
                  setShowAddCustomerForm(false);
                  loadCustomers();
                }} />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Banner for customers without contracts */}
        {customersWithoutContracts.length > 0 && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>
                {customersWithoutContracts.length} {customersWithoutContracts.length === 1 ? 'customer needs' : 'customers need'} contract setup
              </span>
              <Dialog open={showBulkContractForm} onOpenChange={setShowBulkContractForm}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">
                    Setup Contracts
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Bulk Contract Setup</DialogTitle>
                  </DialogHeader>
                  <div className="text-sm text-muted-foreground mb-4">
                    Set up contracts for customers one by one. Click on each customer to configure their contract.
                  </div>
                  <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                    {customersWithoutContracts.map((customer) => (
                      <Dialog 
                        key={customer.id} 
                        open={openContractDialogs[customer.id] || false}
                        onOpenChange={(open) => setOpenContractDialogs({...openContractDialogs, [customer.id]: open})}
                      >
                        <DialogTrigger asChild>
                          <Button variant="outline" className="w-full justify-start">
                            <Users className="mr-2 h-4 w-4" />
                            {customer.nickname || customer.name} - {customer.mwpManaged} MWp
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Setup Contract: {customer.nickname || customer.name}</DialogTitle>
                          </DialogHeader>
                          <ContractForm 
                            existingCustomer={{ 
                              id: customer.id, 
                              name: customer.name,
                              nickname: customer.nickname,
                              location: customer.location, 
                              mwpManaged: customer.mwpManaged 
                            }}
                            onComplete={() => {
                              setOpenContractDialogs({...openContractDialogs, [customer.id]: false});
                              loadCustomers();
                            }}
                            onCancel={() => setOpenContractDialogs({...openContractDialogs, [customer.id]: false})}
                          />
                        </DialogContent>
                      </Dialog>
                    ))}
                  </div>
                </DialogContent>
              </Dialog>
            </AlertDescription>
          </Alert>
        )}

        {/* Tabs for filtering */}
        <Tabs value={filterTab} onValueChange={setFilterTab}>
          <TabsList>
            <TabsTrigger value="all">
              All Customers ({customersData.length})
            </TabsTrigger>
            <TabsTrigger value="active">
              Active with Contracts ({customersData.filter(c => c.status === "active" && c.contractId).length})
            </TabsTrigger>
            <TabsTrigger value="no-contracts">
              Needs Setup ({customersWithoutContracts.length})
            </TabsTrigger>
            <TabsTrigger value="inactive">
              Inactive ({customersData.filter(c => c.status === "inactive").length})
            </TabsTrigger>
            <TabsTrigger value="has-ammp">
              Has AMMP ({customersData.filter(c => c.ammpOrgId).length})
            </TabsTrigger>
            <TabsTrigger value="no-ammp">
              No AMMP ({customersData.filter(c => !c.ammpOrgId).length})
            </TabsTrigger>
            <TabsTrigger value="ammp-synced">
              AMMP Synced ({customersData.filter(c => c.ammpOrgId && c.ammpSyncStatus !== 'never_synced').length})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Search and Sort */}
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search customers by name or location..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="flex gap-2">
            <Select value={sortField} onValueChange={setSortField}>
              <SelectTrigger className="w-[160px]">
                <ArrowUpDown className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="contractValue">Contract Value</SelectItem>
                <SelectItem value="mwpManaged">MWp Managed</SelectItem>
                <SelectItem value="joinDate">Join Date</SelectItem>
                <SelectItem value="lastInvoiced">Last Invoiced</SelectItem>
                <SelectItem value="location">Location</SelectItem>
              </SelectContent>
            </Select>
            
            <Button 
              variant="outline" 
              size="icon"
              onClick={() => setSortDirection(prev => prev === "asc" ? "desc" : "asc")}
              title={sortDirection === "asc" ? "Ascending" : "Descending"}
            >
              {sortDirection === "asc" ? (
                <ArrowUp className="h-4 w-4" />
              ) : (
                <ArrowDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredCustomers.map((customer) => (
            <CustomerCard 
              key={customer.id} 
              id={customer.id}
              name={customer.name}
              nickname={customer.nickname}
              location={customer.location}
              contractValue={`${formatCurrency(convertToDisplayCurrency(customer.contractValue, customer.contractCurrency))}/year`}
              mwpManaged={customer.mwpManaged}
              status={customer.status}
              modules={customer.modules}
              addOns={customer.addOns}
              package={customer.package}
              joinDate={customer.joinDate}
              lastInvoiced={customer.lastInvoiced}
              contractId={customer.contractId}
              hasContract={!!customer.contractId}
              contractCount={customer.contractCount}
              contracts={customer.contracts}
              ammpOrgId={customer.ammpOrgId}
              ammpAssetIds={customer.ammpAssetIds}
              ammpCapabilities={customer.ammpCapabilities}
              lastAmmpSync={customer.lastAmmpSync}
              ammpSyncStatus={customer.ammpSyncStatus}
              onViewContract={() => navigate(`/contracts/${customer.contractId}`)}
              onViewDetails={() => navigate(`/contracts/${customer.contractId}`)}
              onContractCreated={loadCustomers}
            />
          ))}
        </div>

        {filteredCustomers.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No customers found matching your search.</p>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Customers;

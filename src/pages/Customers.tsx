
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import CustomerCard from "@/components/customers/CustomerCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlusCircle, Search, Users, RefreshCw, Loader2, AlertCircle } from "lucide-react";
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
  location: string;
  contractValue: number;
  contractCurrency: string;
  mwpManaged: number;
  status: "active" | "pending" | "inactive";
  addOns: string[];
  joinDate: string;
  lastInvoiced: string;
  contractId: string;
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
  const [isSyncing, setIsSyncing] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [customersData, setCustomersData] = useState<CustomerData[]>([]);
  const [filterTab, setFilterTab] = useState("all");
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
            package,
            modules,
            addons,
            custom_pricing,
            minimum_annual_value,
            minimum_charge,
            volume_discounts,
            currency,
            contract_status
          )
        `)
        .eq('user_id', user.id);

    if (error) {
      console.error('Error loading customers:', error);
      return;
    }

        const calculateContractValue = (contract: any, mwpManaged: number) => {
          if (!contract) return 0;
          
          let annualValue = 0;
          
          if (contract.package === 'starter') {
            // Starter package fixed annual cost
            annualValue = contract.minimum_annual_value || 3000;
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
              { id: 'satelliteDataAPI', pricePerMW: 6 }, // €6/MW/year
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
            const minimumValue = contract.minimum_annual_value || (contract.package === 'pro' ? 5000 : 0);
            annualValue = Math.max(annualValue, minimumValue);
          }
          
          return annualValue;
        };

    const transformed: CustomerData[] = (data || []).map(c => {
      // Filter for active contract only (client-side filtering)
      const activeContract = c.contracts?.find((contract: any) => contract.contract_status === 'active');
      const modules = Array.isArray(activeContract?.modules) ? activeContract.modules as string[] : [];
      const addons = Array.isArray(activeContract?.addons) ? (activeContract.addons as any[]).map((a: any) => a.id || a) : [];
      const mwpManaged = Number(c.mwp_managed) || 0;
      
      return {
        id: c.id,
        name: c.name,
        location: c.location || 'N/A',
        contractValue: calculateContractValue(activeContract, mwpManaged),
        contractCurrency: activeContract?.currency || 'USD',
        mwpManaged,
        status: (c.status || 'active') as "active" | "pending" | "inactive",
        addOns: [...modules, ...addons],
        joinDate: c.join_date || new Date().toISOString(),
        lastInvoiced: c.last_invoiced || new Date().toISOString(),
        contractId: activeContract?.id || '',
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

  const getFilteredCustomers = () => {
    let filtered = customersData;
    
    // Apply tab filter
    if (filterTab === "active") {
      filtered = filtered.filter(c => c.status === "active" && c.contractId);
    } else if (filterTab === "inactive") {
      // Show customers that are inactive OR have no active contract
      filtered = filtered.filter(c => c.status === "inactive" || !c.contractId);
    } else if (filterTab === "no-contracts") {
      filtered = filtered.filter(c => !c.contractId);
    }
    
    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter((customer) =>
        customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.location.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    return filtered;
  };

  const filteredCustomers = getFilteredCustomers();
  const customersWithoutContracts = customersData.filter(c => !c.contractId);

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
                      <Dialog key={customer.id}>
                        <DialogTrigger asChild>
                          <Button variant="outline" className="w-full justify-start">
                            <Users className="mr-2 h-4 w-4" />
                            {customer.name} - {customer.mwpManaged} MWp
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Setup Contract: {customer.name}</DialogTitle>
                          </DialogHeader>
                          <ContractForm 
                            existingCustomer={{ 
                              id: customer.id, 
                              name: customer.name, 
                              location: customer.location, 
                              mwpManaged: customer.mwpManaged 
                            }}
                            onComplete={() => {
                              loadCustomers();
                            }}
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
            <TabsTrigger value="with-contract">
              With Contracts ({customersData.filter(c => c.contractId).length})
            </TabsTrigger>
            <TabsTrigger value="needs-setup">
              Needs Setup ({customersWithoutContracts.length})
            </TabsTrigger>
            <TabsTrigger value="inactive">
              Inactive ({customersData.filter(c => c.status === "inactive").length})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search customers by name or location..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredCustomers.map((customer) => (
            <CustomerCard 
              key={customer.id} 
              id={customer.id}
              name={customer.name}
              location={customer.location}
              contractValue={`${formatCurrency(convertToDisplayCurrency(customer.contractValue, customer.contractCurrency))}/year`}
              mwpManaged={customer.mwpManaged}
              status={customer.status}
              addOns={customer.addOns}
              joinDate={customer.joinDate}
              lastInvoiced={customer.lastInvoiced}
              contractId={customer.contractId}
              hasContract={!!customer.contractId}
              ammpOrgId={customer.ammpOrgId}
              ammpAssetIds={customer.ammpAssetIds}
              ammpCapabilities={customer.ammpCapabilities}
              lastAmmpSync={customer.lastAmmpSync}
              ammpSyncStatus={customer.ammpSyncStatus}
              onViewContract={() => navigate(`/contracts/${customer.contractId}`)} 
              onViewDetails={() => navigate(`/customers/${customer.id}`)} 
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

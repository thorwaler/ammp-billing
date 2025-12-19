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
import { calculateSingleContractARR } from "@/services/analytics/dashboardAnalytics";

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
    cached_capabilities?: any;
  }>;
  package?: string;
  manualStatusOverride?: boolean;
}


const Customers = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddCustomerForm, setShowAddCustomerForm] = useState(false);
  const [showBulkContractForm, setShowBulkContractForm] = useState(false);
  const [openContractDialogs, setOpenContractDialogs] = useState<{[key: string]: boolean}>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
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
            portfolio_discount_tiers,
            site_charge_frequency,
            volume_discounts,
            currency,
            contract_status,
            signed_date,
            base_monthly_price,
            initial_mw,
            annual_fee_per_site,
            retainer_hours,
            retainer_hourly_rate,
            retainer_minimum_value,
            cached_capabilities,
            ammp_asset_group_id,
            ammp_asset_group_name,
            ammp_asset_group_id_and,
            ammp_asset_group_name_and,
            ammp_asset_group_id_not,
            ammp_asset_group_name_not,
            ammp_org_id,
            site_size_threshold_kwp,
            below_threshold_price_per_mwp,
            above_threshold_price_per_mwp,
            period_start,
            period_end,
            billing_frequency,
            contract_expiry_date,
            notes,
            max_mw,
            onboarding_fee_per_site
          )
        `)
        ;

    if (error) {
      console.error('Error loading customers:', error);
      return;
    }

    const transformed: CustomerData[] = (data || []).map(c => {
      // Get ALL active contracts (not just the first one)
      const activeContracts = c.contracts?.filter((contract: any) => contract.contract_status === 'active') || [];
      const firstActiveContract = activeContracts[0];
      const modules = Array.isArray(firstActiveContract?.modules) ? firstActiveContract.modules as string[] : [];
      const addons = Array.isArray(firstActiveContract?.addons) ? (firstActiveContract.addons as any[]).map((a: any) => a.id || a) : [];
      
      // Calculate MW: Sum from all active contracts' cached_capabilities
      let mwpManaged = 0;
      activeContracts.forEach((contract: any) => {
        if (contract.cached_capabilities?.totalMW) {
          mwpManaged += contract.cached_capabilities.totalMW;
        }
      });
      // Fallback to customer-level mwp_managed if no cached_capabilities
      if (mwpManaged === 0) {
        mwpManaged = Number(c.mwp_managed) || 0;
      }
      
      // Count total contracts for this customer
      const contractCount = c.contracts?.length || 0;
      
      // Find the earliest contract signed date across ALL contracts
      const firstSignedDate = c.contracts && c.contracts.length > 0
        ? c.contracts
            .map((contract: any) => contract.signed_date)
            .filter((date: string) => date) // Remove nulls
            .sort((a: string, b: string) => new Date(a).getTime() - new Date(b).getTime())[0]
        : null;
      
      // Sum contract values from ALL active contracts using cached_capabilities
      const totalContractValue = activeContracts.reduce((sum: number, contract: any) => {
        return sum + calculateSingleContractARR(contract);
      }, 0);
      
      // Get currency from first active contract (for display purposes)
      const contractCurrency = firstActiveContract?.currency || 'USD';
      
      return {
        id: c.id,
        name: c.name,
        nickname: c.nickname || null,
        location: c.location || 'N/A',
        contractValue: totalContractValue,
        contractCurrency,
        mwpManaged,
        status: (c.status || 'active') as "active" | "pending" | "inactive",
        modules: modules,
        addOns: addons,
        joinDate: firstSignedDate || c.join_date || new Date().toISOString(),
        lastInvoiced: c.last_invoiced || undefined,
        contractId: firstActiveContract?.id || '',
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
          cached_capabilities: contract.cached_capabilities,
          // AMMP fields
          ammp_org_id: contract.ammp_org_id,
          ammp_asset_group_id: contract.ammp_asset_group_id,
          ammp_asset_group_name: contract.ammp_asset_group_name,
          ammp_asset_group_id_and: contract.ammp_asset_group_id_and,
          ammp_asset_group_name_and: contract.ammp_asset_group_name_and,
          ammp_asset_group_id_not: contract.ammp_asset_group_id_not,
          ammp_asset_group_name_not: contract.ammp_asset_group_name_not,
          // Other contract fields needed for editing
          modules: contract.modules,
          addons: contract.addons,
          custom_pricing: contract.custom_pricing,
          minimum_annual_value: contract.minimum_annual_value,
          minimum_charge: contract.minimum_charge,
          minimum_charge_tiers: contract.minimum_charge_tiers,
          portfolio_discount_tiers: contract.portfolio_discount_tiers,
          site_charge_frequency: contract.site_charge_frequency,
          volume_discounts: contract.volume_discounts,
          currency: contract.currency,
          billing_frequency: contract.billing_frequency,
          base_monthly_price: contract.base_monthly_price,
          initial_mw: contract.initial_mw,
          annual_fee_per_site: contract.annual_fee_per_site,
          retainer_hours: contract.retainer_hours,
          retainer_hourly_rate: contract.retainer_hourly_rate,
          retainer_minimum_value: contract.retainer_minimum_value,
          site_size_threshold_kwp: contract.site_size_threshold_kwp,
          below_threshold_price_per_mwp: contract.below_threshold_price_per_mwp,
          above_threshold_price_per_mwp: contract.above_threshold_price_per_mwp,
          contract_expiry_date: contract.contract_expiry_date,
          notes: contract.notes,
          max_mw: contract.max_mw,
          onboarding_fee_per_site: contract.onboarding_fee_per_site,
        })),
        package: firstActiveContract?.package || undefined,
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
      // Show only customers with inactive status
      filtered = filtered.filter(c => c.status === "inactive");
    } else if (filterTab === "no-contracts") {
      // Show customers that have no contract AND are not inactive
      filtered = filtered.filter(c => !c.contractId && c.status !== "inactive");
    }
    
    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter((customer) =>
        customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.nickname?.toLowerCase().includes(searchTerm.toLowerCase()) ||
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
            <Dialog open={showAddCustomerForm} onOpenChange={setShowAddCustomerForm}>
              <DialogTrigger asChild>
                <Button>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Add Customer
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
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
                            {customer.nickname || customer.name} - {customer.mwpManaged.toFixed(2)} MWp
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
                              mwpManaged: customer.mwpManaged,
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


import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FileText, Download, Edit, Clock, Calculator, MoreVertical, RefreshCw, Trash2, Percent, Zap, AlertCircle, ArrowRightLeft, Copy } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import ContractForm from "@/components/contracts/ContractForm";
import CustomerForm from "@/components/customers/CustomerForm";

import ContractAmendments from "@/components/contracts/ContractAmendments";
import { AssetStatusTimeline } from "@/components/contracts/AssetStatusTimeline";
import { AssetDiscountDialog, DiscountBadge } from "@/components/contracts/AssetDiscountDialog";
import { DuplicateContractDialog } from "@/components/contracts/DuplicateContractDialog";
import { useIgnoredAssets } from "@/hooks/useIgnoredAssets";
import { Switch } from "@/components/ui/switch";

import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { CustomAssetPricing } from "@/lib/invoiceCalculations";

// Helper function to map module IDs to names
const moduleNames: {[key: string]: string} = {
  technicalMonitoring: "Technical Monitoring",
  energySavingsHub: "Energy Savings Hub",
  stakeholderPortal: "Stakeholder Portal",
  control: "Control",
  // AMMP OS 2026 modules
  smartAlerting: "Smart Alerting",
  liveMonitoring: "Live Monitoring and Alerting",
  performanceMonitoring: "Performance Monitoring and Reporting",
  financialReporting: "Financial Reporting",
  dataApi: "Data API",
};

// Helper function to map addon IDs to names
const addonNames: {[key: string]: string} = {
  customKPIs: "Custom KPIs",
  customAPIIntegration: "Custom API Integration",
  satelliteDataAPI: "Satellite Data API Access",
  dataLoggerSetup: "Data Logger Setup",
  tmCustomDashboards: "Custom Dashboards",
  tmCustomReports: "Custom Reports",
  tmCustomAlerts: "Custom Alerts",
  eshCustomDashboard: "Custom Dashboard",
  eshCustomReport: "Custom Report",
  eshCustomKPIs: "Custom KPIs",
  spCustomDashboard: "Custom Dashboard",
  spCustomReport: "Custom Report",
  // AMMP OS 2026 addons
  dataLoggerSetup2026: "Data Logger Setup",
  customDashboardReportAlerts: "Custom Dashboard / Report / 10 Alerts",
  customKPIs2026: "Custom KPI Development",
  customAPIDevelopment: "Custom API Development",
};

// Elum 2026 sub-org tier labels
const elumTierLabel = (tier?: string | null) => {
  switch (tier) {
    case 'ci_lite': return 'C&I Light';
    case 'ci_pro': return 'C&I Pro';
    case 'utility': return 'Utility';
    case 'internal': return 'Internal';
    default: return 'No tier flag';
  }
};

// Helper function to format date in CET timezone
import { formatDateCET } from "@/lib/dateUtils";
import { mapContractRowToFormValues } from "@/lib/contractFormMapping";
import { registerBatteryOnlyAssets, isBatteryOnlyAsset } from "@/lib/batteryOnlyAssets";
const formatDate = (dateString: string) => {
  try {
    return formatDateCET(dateString, 'MMM d, yyyy');
  } catch (e) {
    return dateString;
  }
};

const ContractDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [contract, setContract] = useState<any>(null);
  const [customer, setCustomer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showExtendDialog, setShowExtendDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showEditCustomerDialog, setShowEditCustomerDialog] = useState(false);

  const [isRefreshingAssets, setIsRefreshingAssets] = useState(false);
  const [showAllAssets, setShowAllAssets] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<any | null>(null);
  const [discountDialogOpen, setDiscountDialogOpen] = useState(false);
  const [discountEditAsset, setDiscountEditAsset] = useState<any | null>(null);
  const [isEnrichingDevices, setIsEnrichingDevices] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [moveTargetCustomerId, setMoveTargetCustomerId] = useState("");
  const [allCustomers, setAllCustomers] = useState<any[]>([]);
  const [isMoving, setIsMoving] = useState(false);
  const { isIgnored: isAssetIgnoredLive, toggle: toggleIgnoredAsset } = useIgnoredAssets();

  // PV capacity sanity check (observed peak output vs registered capacity)
  interface CapacityCheckResult {
    assetId: string;
    assetName: string;
    registeredKWp: number;
    observedKWp: number | null;
    ratio: number | null;
    verdict: 'ok' | 'too_low' | 'too_high' | 'no_data' | 'error';
    error?: string;
    source?: 'pv_energy_out' | 'pv_power' | null;
  }
  const [isCheckingCapacity, setIsCheckingCapacity] = useState(false);
  const [capacityCheck, setCapacityCheck] = useState<{
    checked: number;
    totalAssets: number;
    truncated: boolean;
    suspiciousCount: number;
    noDataCount: number;
    errorCount?: number;
    errorSample?: string[];
    results: CapacityCheckResult[];
  } | null>(null);


  const capacityCheckByAsset = useMemo(() => {
    const map = new Map<string, CapacityCheckResult>();
    for (const r of capacityCheck?.results ?? []) {
      if (r.verdict === 'too_low' || r.verdict === 'too_high') map.set(r.assetId, r);
    }
    return map;
  }, [capacityCheck]);

  // The AMMP time-series responses are megabytes per device, so the edge function
  // handles a slice of the assets per call and we page through until it is done.
  const runCapacitySanityCheck = async () => {
    setIsCheckingCapacity(true);
    setCapacityCheck(null);
    try {
      const all: CapacityCheckResult[] = [];
      let offset: number | null = 0;
      let totalAssets = 0;
      let truncated = false;
      const errorMessages = new Set<string>();

      while (offset !== null) {
        const { data, error } = await supabase.functions.invoke('ammp-capacity-sanity-check', {
          body: { contractId: id, offset },
        });
        if (error) throw error;
        if (!data?.ok) throw new Error(data?.error || 'Capacity check failed');

        all.push(...(data.results ?? []));
        totalAssets = data.totalAssets ?? totalAssets;
        truncated = truncated || !!data.truncated;
        for (const m of data.errorSample ?? []) errorMessages.add(m);

        setCapacityCheck({
          checked: all.length,
          totalAssets,
          truncated,
          suspiciousCount: all.filter((r) => r.verdict === 'too_low' || r.verdict === 'too_high').length,
          noDataCount: all.filter((r) => r.verdict === 'no_data').length,
          errorCount: all.filter((r) => r.verdict === 'error').length,
          errorSample: Array.from(errorMessages).slice(0, 3),
          results: all,
        });

        offset = truncated ? null : (data.nextOffset ?? null);
      }

      const suspiciousCount = all.filter((r) => r.verdict === 'too_low' || r.verdict === 'too_high').length;
      const noDataCount = all.filter((r) => r.verdict === 'no_data').length;
      const errorCount = all.filter((r) => r.verdict === 'error').length;
      toast({
        title: 'Capacity check complete',
        description: `${suspiciousCount} suspicious site(s), ${noDataCount} without data${
          errorCount ? `, ${errorCount} failed` : ''
        } (of ${all.length} checked).`,
      });


    } catch (err: any) {
      toast({
        title: 'Capacity check failed',
        description: err?.message || 'Could not reach the AMMP data API',
        variant: 'destructive',
      });
    } finally {
      setIsCheckingCapacity(false);
    }
  };



  // All contracts now use contract-level sync via cached_capabilities.
  // Elum 2026 org-tier contracts only carry elum_parent_org_id, so include it here.
  const hasAMMPData = contract && (
    contract.ammp_org_id ||
    contract.contract_ammp_org_id ||
    contract.ammp_asset_group_id ||
    contract.elum_parent_org_id
  );
  const cachedCapabilities = contract?.cached_capabilities;
  useEffect(() => {
    registerBatteryOnlyAssets(cachedCapabilities);
  }, [cachedCapabilities]);



  // Elum 2026: map each asset to the sub-org (and tier) it was resolved from
  const orgBreakdown: any[] = cachedCapabilities?.orgBreakdown || [];
  const assetCategoryMap = useMemo(() => {
    const map = new Map<string, { label: string; tier: string | null; isLegacy: boolean }>();
    orgBreakdown.forEach((org: any) => {
      (org.assets || []).forEach((a: any) => {
        map.set(a.assetId, {
          label: org.isLegacyAssetGroup ? (org.orgName || 'Legacy asset group') : (org.orgName || org.orgId),
          tier: org.tier || null,
          isLegacy: org.isLegacyAssetGroup === true,
        });
      });
    });
    return map;
  }, [cachedCapabilities]);
  const showCategoryColumn = orgBreakdown.length > 0;

  // Elum 2026: per-org resolution audit recorded by the last sync
  const orgResolution: any[] = cachedCapabilities?.orgResolution || [];
  const unassignedOrgs: any[] = cachedCapabilities?.unassignedOrgs || [];
  const tierConflictOrgs: any[] = cachedCapabilities?.tierConflictOrgs || [];
  const excludedOrgs: any[] = cachedCapabilities?.excludedOrgs || [];
  const emptyOrgs = orgResolution.filter(
    (o: any) => !o.assetCount && !String(o.source || '').includes('ignored-flag-only')
  );

  const loadContractData = async () => {
      setLoading(true);
      setError(null);
      setError(null);
      
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setError("Please log in to view contract details");
          setLoading(false);
          return;
        }

        // First, try to fetch as a contract ID
        const { data: contractData, error: contractError } = await supabase
          .from('contracts')
          .select(`
            *,
            customers (
              id,
              name,
              nickname,
              location,
              mwp_managed,
              status,
              manual_status_override,
              xero_branding_theme_id,
              xero_tax_type,
              wht_gross_up_rate
            )

          `)
          .eq('id', id)
          .single();

        if (contractData && !contractError) {
          setContract(contractData);
          setCustomer(contractData.customers);
          setLoading(false);
          return;
        }

        // If not found as contract, try as customer ID
        const { data: customerData, error: customerError } = await supabase
          .from('customers')
          .select(`
            *,
            contracts (*)
          `)
          .eq('id', id)
          .single();

        if (customerData && !customerError) {
          setCustomer(customerData);
          const contractRecord = customerData.contracts?.[0];
          
          if (contractRecord) {
            setContract(contractRecord);
          } else {
            setError("This customer doesn't have a contract yet. Please set up a contract first.");
          }
        } else {
          setError("Contract or customer not found");
        }
      } catch (err) {
        console.error('Error loading contract details:', err);
        setError("Failed to load contract details");
      } finally {
        setLoading(false);
      }
    };

  useEffect(() => {
    loadContractData();
  }, [id]);

  const handleStatusChange = async (newStatus: string) => {
    try {
      const { error } = await supabase
        .from('contracts')
        .update({ contract_status: newStatus })
        .eq('id', contract.id);

      if (error) throw error;

      toast({
        title: "Contract status updated",
        description: `Contract marked as ${newStatus}.`,
      });

      loadContractData();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update contract status",
        variant: "destructive",
      });
    }
  };

  const handleDownloadContract = () => {
    // Simulating contract download
    toast({
      title: "Download started",
      description: `Downloading ${contract?.contractFile}`,
    });
  };

  const handleRefreshAssets = async () => {
    if (!contract) return;
    
    setIsRefreshingAssets(true);
    try {
      const { data, error } = await supabase.functions.invoke('ammp-sync-contract', {
        body: { contractId: contract.id }
      });
      
      if (error) throw error;
      
      if (data.success) {
        toast({
          title: "Asset data refreshed",
          description: `Synced ${data.totalSites} sites (${data.totalMW?.toFixed(4)} MW)`,
        });
        loadContractData();
      } else {
        throw new Error(data.error || 'Refresh failed');
      }
    } catch (error: any) {
      toast({
        title: "Refresh failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsRefreshingAssets(false);
    }
  };

  const handleExtendContract = () => {
    // Would handle contract extension logic
    setShowExtendDialog(false);
    toast({
      title: "Contract extended",
      description: `${contract?.companyName}'s contract has been extended`,
    });
  };

  const handleClearAMMPData = async () => {
    if (!contract) return;
    
    try {
      const { error } = await supabase
        .from('contracts')
        .update({
          cached_capabilities: null,
          ammp_asset_ids: [],
          ammp_sync_status: 'never_synced',
          last_ammp_sync: null,
        })
        .eq('id', contract.id);

      if (error) throw error;

      toast({
        title: "AMMP data cleared",
        description: "Asset data has been removed from this contract. Configuration preserved.",
      });
      loadContractData();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to clear AMMP data",
        variant: "destructive",
      });
    }
  };

  const handleOpenMoveDialog = async () => {
    setShowMoveDialog(true);
    setMoveTargetCustomerId("");
    const { data } = await supabase
      .from('customers')
      .select('id, name, nickname')
      .order('name');
    setAllCustomers((data || []).filter(c => c.id !== contract.customer_id));
  };

  const handleMoveContract = async () => {
    if (!moveTargetCustomerId || !contract) return;
    setIsMoving(true);
    try {
      const targetCustomer = allCustomers.find(c => c.id === moveTargetCustomerId);
      if (!targetCustomer) throw new Error("Customer not found");

      const { error } = await supabase
        .from('contracts')
        .update({ customer_id: moveTargetCustomerId, company_name: targetCustomer.name })
        .eq('id', contract.id);

      if (error) throw error;

      toast({
        title: "Contract moved",
        description: `Contract moved to ${targetCustomer.name}.`,
      });
      setShowMoveDialog(false);
      loadContractData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to move contract",
        variant: "destructive",
      });
    } finally {
      setIsMoving(false);
    }
  };

  const handleSaveAssetDiscount = async (
    assetId: string, 
    discount: { pricingType: 'annual' | 'per_mw'; price: number; note?: string } | null
  ) => {
    if (!contract) return;
    
    try {
      const currentPricing = (contract.custom_asset_pricing || {}) as CustomAssetPricing;
      let updatedPricing: CustomAssetPricing;
      
      if (discount) {
        updatedPricing = { ...currentPricing, [assetId]: discount };
      } else {
        // Remove discount
        const { [assetId]: _, ...rest } = currentPricing;
        updatedPricing = rest;
      }
      
      const { error } = await supabase
        .from('contracts')
        .update({ custom_asset_pricing: updatedPricing })
        .eq('id', contract.id);

      if (error) throw error;

      toast({
        title: discount ? "Discount saved" : "Discount removed",
        description: discount 
          ? `Custom discounted rate applied to asset.`
          : `Asset returned to normal pricing.`,
      });
      
      loadContractData();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save asset discount",
        variant: "destructive",
      });
    }
  };

  const openDiscountDialog = (asset: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setDiscountEditAsset(asset);
    setDiscountDialogOpen(true);
  };

  const getAssetDiscount = (assetId: string) => {
    const pricing = contract?.custom_asset_pricing as CustomAssetPricing | undefined;
    return pricing?.[assetId];
  };

  const handleEnrichDevices = async (forceRecalculate = false, forceRefetch = false) => {
    if (!contract) return;
    
    setIsEnrichingDevices(true);
    try {
      let complete = false;
      let totalEnriched = 0;
      
      while (!complete) {
        const { data, error } = await supabase.functions.invoke('ammp-device-enrichment', {
          body: { contractId: contract.id, batchSize: 500, forceRecalculate, forceRefetch }
        });
        
        if (error) throw error;
        if (!data.success) throw new Error(data.error || 'Enrichment failed');
        
        // forceRecalculate is a single-pass operation
        if (forceRecalculate) {
          toast({
            title: "Hybrid status recalculated",
            description: `Found ${data.hybridSites} hybrid sites (${data.hybridMW?.toFixed(2)} MW), ${data.ongridSites} ongrid sites (${data.ongridMW?.toFixed(2)} MW).`,
          });
          complete = true;
          break;
        }
        
        totalEnriched += data.enriched || 0;
        complete = data.complete;
        
        if (!complete) {
          toast({
            title: "Enriching device data...",
            description: `Processed ${totalEnriched} assets so far. ${data.remaining || 0} remaining...`,
          });
          await new Promise(r => setTimeout(r, 1000));
        }
      }
      
      if (!forceRecalculate) {
        toast({
          title: "Device enrichment complete",
          description: `All ${totalEnriched} assets enriched successfully.`,
        });
      }
      loadContractData();
    } catch (error: any) {
      toast({
        title: forceRecalculate ? "Recalculation failed" : forceRefetch ? "Refetch failed" : "Enrichment failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsEnrichingDevices(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center items-center h-[50vh]">
          <div className="text-center">
            <Clock className="animate-spin h-8 w-8 mx-auto text-muted-foreground" />
            <p className="mt-2">Loading contract details...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !contract) {
    return (
      <Layout>
        <div className="text-center py-10">
          <h2 className="text-2xl font-bold text-destructive">Error</h2>
          <p className="text-muted-foreground mt-2">{error || "Contract not found"}</p>
          <div className="flex gap-2 justify-center mt-4">
            <Button variant="outline" onClick={() => navigate('/customers')}>
              Back to Customers
            </Button>
            {customer && !contract && (
              <Button onClick={() => navigate('/customers')}>
                Setup Contract
              </Button>
            )}
          </div>
        </div>
      </Layout>
    );
  }

  const daysUntilExpiration = () => {
    // Use contract_expiry_date for contract expiration (not period_end which is billing period)
    if (!contract.contract_expiry_date) return null;
    const today = new Date();
    const expiration = new Date(contract.contract_expiry_date);
    const diffTime = expiration.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const expirationStatus = () => {
    const days = daysUntilExpiration();
    if (days === null) return { label: "No end date set", variant: "secondary" };
    if (days < 0) return { label: "Contract ended", variant: "destructive" };
    if (days < 30) return { label: `Ends in ${days} days`, variant: "destructive" };
    if (days < 90) return { label: `Ends in ${days} days`, variant: "warning" };
    return { label: `Ends in ${days} days`, variant: "default" };
  };

  const companyName = customer?.name || contract.company_name || "Unknown Company";

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="h-8 w-8 text-primary" />
              <div className="flex flex-col">
                <h1 className="text-3xl font-bold tracking-tight">{companyName}</h1>
                {(contract as any).contract_name && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {(contract as any).contract_name}
                  </p>
                )}
              </div>
              <Badge
                variant={
                  contract.contract_status === 'active' ? 'default' : 
                  contract.contract_status === 'pending' ? 'secondary' : 
                  contract.contract_status === 'cancelled' ? 'destructive' : 
                  'outline'
                }
                className={
                  contract.contract_status === 'active' ? 'bg-green-600 hover:bg-green-700' : 
                  contract.contract_status === 'pending' ? 'bg-yellow-600 hover:bg-yellow-700' : 
                  contract.contract_status === 'expired' ? 'bg-gray-600 hover:bg-gray-700' : 
                  ''
                }
              >
                {contract.contract_status?.charAt(0).toUpperCase() + contract.contract_status?.slice(1) || 'Active'}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1">
              {customer?.location && <span>{customer.location} • </span>}
              Contract ID: {contract.id.substring(0, 8)}
            </p>
          </div>
          
          <div className="flex gap-2 flex-wrap">
            {hasAMMPData && (
              <Button 
                variant="outline" 
                onClick={handleRefreshAssets}
                disabled={isRefreshingAssets}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshingAssets ? 'animate-spin' : ''}`} />
                {isRefreshingAssets ? 'Refreshing...' : 'Sync AMMP'}
              </Button>
            )}
            <Button variant="outline" onClick={handleDownloadContract}>
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </Button>
            
            <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Edit Contract - {companyName}</DialogTitle>
                </DialogHeader>
                <ContractForm 
                  existingCustomer={customer ? {
                    id: customer.id,
                    name: customer.name,
                    location: customer.location,
                    mwpManaged: cachedCapabilities?.totalMW || customer.mwp_managed || 0,
                  } : undefined}
                existingContract={mapContractRowToFormValues(contract)}
                  onComplete={() => {
                    setShowEditDialog(false);
                    loadContractData();
                  }}
                  onCancel={() => setShowEditDialog(false)}
                />
              </DialogContent>
            </Dialog>

            {customer && (
              <Dialog open={showEditCustomerDialog} onOpenChange={setShowEditCustomerDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Edit className="mr-2 h-4 w-4" />
                    Edit customer
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Edit Customer - {customer.name}</DialogTitle>
                  </DialogHeader>
                  <CustomerForm
                    existingCustomer={{
                      ...customer,
                      mwpManaged: customer.mwp_managed || 0,
                    }}
                    onComplete={() => {
                      setShowEditCustomerDialog(false);
                      loadContractData();
                    }}
                  />
                </DialogContent>
              </Dialog>
            )}

            <Button variant="outline" onClick={() => setShowDuplicateDialog(true)}>
              <Copy className="mr-2 h-4 w-4" />
              Duplicate
            </Button>


            {contract && (
              <DuplicateContractDialog
                open={showDuplicateDialog}
                onOpenChange={setShowDuplicateDialog}
                contractId={contract.id}
                currentCustomerId={contract.customer_id}
                onDuplicated={() => navigate('/contracts')}
              />
            )}


            
            <Dialog open={showExtendDialog} onOpenChange={setShowExtendDialog}>
              <DialogTrigger asChild>
                <Button>
                  Extend Contract
                </Button>
              </DialogTrigger>
        <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Extend Contract - {contract.company_name}</DialogTitle>
            <DialogDescription>
              Update the contract period and make any necessary changes
            </DialogDescription>
          </DialogHeader>
          <ContractForm 
            existingCustomer={{
              id: contract.customer_id,
              name: contract.company_name,
              mwpManaged: cachedCapabilities?.totalMW || customer?.mwp_managed || contract.initial_mw,
            }}
            existingContract={mapContractRowToFormValues(contract)}
            isExtending={true}
            onComplete={() => {
              setShowExtendDialog(false);
              loadContractData();
            }}
            onCancel={() => setShowExtendDialog(false)} 
          />
        </DialogContent>
            </Dialog>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-background">
                {contract.contract_status === 'active' && (
                  <>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                          Mark as Expired
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Mark Contract as Expired</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will stop generating invoices for this contract. You can reactivate it later if needed.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleStatusChange('expired')}>
                            Confirm
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                          Mark as Cancelled
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Mark Contract as Cancelled</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will cancel the contract and stop generating invoices. You can reactivate it later if needed.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleStatusChange('cancelled')}>
                            Confirm
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}
                {(contract.contract_status === 'expired' || contract.contract_status === 'cancelled') && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                        Reactivate Contract
                      </DropdownMenuItem>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Reactivate Contract</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will reactivate the contract and resume generating invoices. Make sure to update the next invoice date.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleStatusChange('active')}>
                          Confirm
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                {hasAMMPData && cachedCapabilities && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" />
                        Clear AMMP Data
                      </DropdownMenuItem>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Clear AMMP Data</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will remove all synced asset data from this contract. The AMMP configuration (Org ID, Asset Groups) will be preserved so you can re-sync later.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleClearAMMPData} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Clear Data
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleOpenMoveDialog(); }}>
                  <ArrowRightLeft className="mr-2 h-4 w-4" />
                  Move to Customer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Dialog open={showMoveDialog} onOpenChange={setShowMoveDialog}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Move Contract to Another Customer</DialogTitle>
                  <DialogDescription>
                    Select the customer you want to move this contract to. The contract's customer and company name will be updated.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <Select value={moveTargetCustomerId} onValueChange={setMoveTargetCustomerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {allCustomers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}{c.nickname ? ` (${c.nickname})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowMoveDialog(false)}>Cancel</Button>
                  <Button onClick={handleMoveContract} disabled={!moveTargetCustomerId || isMoving}>
                    {isMoving ? 'Moving...' : 'Move Contract'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Contract Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Package</p>
                  <p className="font-medium">
                    {({
                      starter: "AMMP OS Starter",
                      pro: "AMMP OS Pro",
                      custom: "Custom/Legacy",
                      hybrid_tiered: "Hybrid Tiered",
                      hybrid_tiered_assetgroups: "Hybrid Tiered (Asset Groups)",
                      capped: "Capped Package",
                      poc: "Proof of Concept",
                      per_site: "Per-Site Billing",
                      elum_epm: "Elum ePM",
                      elum_jubaili: "Elum Jubaili",
                      elum_portfolio_os: "Elum Portfolio OS",
                      elum_internal: "Elum Internal Assets",
                      ammp_os_2026: "AMMP OS 2026",
                      solar_africa_api: "SolarAfrica API",
                      matriarch_api: "Matriarch API"
                    } as Record<string, string>)[contract.package] || contract.package}
                  </p>
                </div>
                
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Status</p>
                  <div className="flex items-center space-x-2">
                    <Badge variant={contract.contract_status === "active" ? "default" : "secondary"}>
                      {contract.contract_status}
                    </Badge>
                    {contract.is_trial && (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
                        Trial
                      </Badge>
                    )}
                    <Badge 
                      variant={expirationStatus().variant as any}
                      className={expirationStatus().variant === "warning" ? "bg-orange-500" : ""}
                    >
                      {expirationStatus().label}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Next Invoice Date</p>
                  <p className="font-medium">
                    {contract.next_invoice_date 
                      ? formatDate(contract.next_invoice_date)
                      : "Not set"}
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Billing Frequency</p>
                  <p className="font-medium capitalize">
                    {contract.billing_frequency || 'Annual'}
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Contract Signed</p>
                  <p className="font-medium">
                    {contract.signed_date 
                      ? formatDate(contract.signed_date)
                      : "Not set"}
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Current Period</p>
                  <p className="font-medium">
                    {contract.period_start && contract.period_end
                      ? `${formatDate(contract.period_start)} - ${formatDate(contract.period_end)}`
                      : "Not set"}
                  </p>
                </div>
                
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Initial MW</p>
                  <p className="font-medium">{contract.initial_mw} MWp</p>
                </div>
                
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Current MW</p>
                  <p className="font-medium">{cachedCapabilities?.totalMW?.toFixed(4) || contract.initial_mw} MWp</p>
                </div>
                
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Created Date</p>
                  <p className="font-medium">{formatDate(contract.created_at)}</p>
                </div>
                
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Last Updated</p>
                  <p className="font-medium">{formatDate(contract.updated_at)}</p>
                </div>
                
                {contract.minimum_charge && contract.minimum_charge > 0 && (
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Minimum Charge per Site</p>
                    <p className="font-medium">{contract.currency === 'EUR' ? '€' : '$'}{contract.minimum_charge}</p>
                  </div>
                )}
                
                {/* SolarAfrica API specific fields */}
                {contract.package === 'solar_africa_api' && (
                  <>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Municipality Count</p>
                      <p className="font-medium">{contract.municipality_count || 0}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Setup Fee</p>
                      <p className="font-medium">€{(contract.api_setup_fee || 0).toLocaleString()}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Customization Hourly Rate</p>
                      <p className="font-medium">€{contract.hourly_rate || 0}/hr</p>
                    </div>
                  </>
                )}
              </div>
              
              <Separator />
              
              <div>
                <h3 className="font-medium mb-3">Modules</h3>
                <div className="flex flex-wrap gap-2">
                  {(contract.modules || []).map((moduleId: string) => (
                    <Badge key={moduleId} variant="outline" className="bg-blue-50">
                      {moduleNames[moduleId] || moduleId}
                    </Badge>
                  ))}
                </div>
              </div>
              
              {contract.addons && contract.addons.length > 0 && (
                <div>
                  <h3 className="font-medium mb-3">Add-ons</h3>
                  <div className="flex flex-wrap gap-2">
                    {contract.addons.map((addon: any) => {
                      const addonId = typeof addon === 'string' ? addon : addon.id;
                      return (
                        <Badge key={addonId} variant="outline" className="bg-green-50">
                          {addonNames[addonId] || addonId}
                          {addon.complexity && <span className="ml-1 text-xs">({addon.complexity})</span>}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Financial Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {contract.package === "starter" ? (
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Annual Package Fee</p>
                  <p className="font-medium">
                    {contract.currency === 'EUR' ? '€' : '$'}
                    {contract.minimum_annual_value?.toLocaleString() || '0'}
                  </p>
                </div>
              ) : contract.package === "capped" ? (
                <>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Fixed Annual Fee</p>
                    <p className="font-medium">
                      {contract.currency === 'EUR' ? '€' : '$'}
                      {contract.minimum_annual_value?.toLocaleString() || '0'}
                    </p>
                  </div>
                  
                  <Separator />
                  
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Maximum MW Cap</p>
                    <p className="font-medium">{contract.max_mw?.toLocaleString() || '0'} MW</p>
                  </div>
                  
                  {customer && contract.max_mw && (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">Current MW vs Cap</p>
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <div className="flex justify-between text-xs mb-1">
                              <span>{customer.mwp_managed?.toFixed(2) || 0} MW</span>
                              <span>{contract.max_mw?.toFixed(2)} MW</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div 
                                className={`h-full transition-all ${
                                  (customer.mwp_managed || 0) > contract.max_mw ? 'bg-destructive' :
                                  (customer.mwp_managed || 0) / contract.max_mw > 0.8 ? 'bg-yellow-500' :
                                  'bg-green-500'
                                }`}
                                style={{ 
                                  width: `${Math.min(100, ((customer.mwp_managed || 0) / contract.max_mw) * 100)}%` 
                                }}
                              />
                            </div>
                          </div>
                        </div>
                        {(customer.mwp_managed || 0) > contract.max_mw && (
                          <p className="text-xs text-destructive font-medium">
                            ⚠️ MW capacity exceeded by {((customer.mwp_managed || 0) - contract.max_mw).toFixed(2)} MW
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </>
              ) : contract.package === "elum_internal" ? (
                <>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Graduated MW Pricing Tiers</p>
                    {contract.graduated_mw_tiers && contract.graduated_mw_tiers.length > 0 ? (
                      <div className="space-y-2 text-sm">
                        {contract.graduated_mw_tiers.map((tier: any, index: number) => {
                          const totalMW = cachedCapabilities?.totalMW || 0;
                          const isApplied = totalMW > tier.minMW && 
                            (tier.maxMW === null || tier.maxMW === undefined || totalMW > tier.minMW);
                          return (
                            <div 
                              key={index} 
                              className={`flex justify-between ${isApplied ? 'font-medium text-primary' : 'text-muted-foreground'}`}
                            >
                              <span>{tier.label || `${tier.minMW}-${tier.maxMW || '∞'} MW`}:</span>
                              <span>
                                {contract.currency === 'EUR' ? '€' : '$'}{tier.pricePerMW}/MW/year
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-sm">No tiers configured</p>
                    )}
                  </div>
                  
                  <Separator />
                  
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Portfolio Summary</p>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>Total Sites:</span>
                        <span className="font-medium">{cachedCapabilities?.totalSites || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total MW:</span>
                        <span className="font-medium">{cachedCapabilities?.totalMW?.toFixed(2) || 0} MW</span>
                      </div>
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Estimated Annual Value</p>
                    <p className="font-medium">
                      {contract.currency === 'EUR' ? '€' : '$'}
                      {(() => {
                        const totalMW = cachedCapabilities?.totalMW || 0;
                        const tiers = contract.graduated_mw_tiers || [];
                        const sortedTiers = [...tiers].sort((a: any, b: any) => a.minMW - b.minMW);
                        
                        let remainingMW = totalMW;
                        let total = 0;
                        
                        for (const tier of sortedTiers) {
                          if (remainingMW <= 0) break;
                          
                          const tierStart = tier.minMW;
                          const tierEnd = tier.maxMW ?? Infinity;
                          const tierCapacity = tierEnd - tierStart;
                          
                          const mwInThisTier = Math.min(remainingMW, tierCapacity);
                          total += mwInThisTier * tier.pricePerMW;
                          
                          remainingMW -= mwInThisTier;
                        }
                        
                        return total.toLocaleString();
                      })()}
                    </p>
                  </div>
                </>
              ) : contract.package === "elum_epm" ? (
                <>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Site Size Threshold</p>
                    <p className="font-medium">{contract.site_size_threshold_kwp || 100} kWp</p>
                  </div>
                  
                  <Separator />
                  
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Pricing per MWp</p>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm">Sites ≤{contract.site_size_threshold_kwp || 100}kWp:</span>
                        <span className="font-medium">
                          {contract.currency === 'EUR' ? '€' : '$'}{contract.below_threshold_price_per_mwp || 50}/MWp/year
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Sites &gt;{contract.site_size_threshold_kwp || 100}kWp:</span>
                        <span className="font-medium">
                          {contract.currency === 'EUR' ? '€' : '$'}{contract.above_threshold_price_per_mwp || 30}/MWp/year
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {contract.minimum_charge_tiers && contract.minimum_charge_tiers.length > 0 && (
                    <>
                      <Separator />
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Minimum Fee per Site</p>
                        <p className="font-medium">
                          {contract.currency === 'EUR' ? '€' : '$'}
                          {(contract.minimum_charge_tiers[0] as any)?.chargePerSite || 0}/site (floor)
                        </p>
                      </div>
                    </>
                  )}
                  
                  <Separator />
                  
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Portfolio Summary</p>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>Total Sites:</span>
                        <span className="font-medium">{cachedCapabilities?.totalSites || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total MW:</span>
                        <span className="font-medium">{cachedCapabilities?.totalMW?.toFixed(2) || 0} MW</span>
                      </div>
                      {cachedCapabilities?.sitesWithSolcast > 0 && (
                        <div className="flex justify-between">
                          <span>Solcast Sites:</span>
                          <span className="font-medium">{cachedCapabilities.sitesWithSolcast}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Estimated Annual Value</p>
                    <p className="font-medium">
                      {contract.currency === 'EUR' ? '€' : '$'}
                      {(() => {
                        const assets = cachedCapabilities?.assetBreakdown || [];
                        const threshold = contract.site_size_threshold_kwp || 100;
                        const belowPrice = contract.below_threshold_price_per_mwp || 50;
                        const abovePrice = contract.above_threshold_price_per_mwp || 30;
                        const minFee = contract.minimum_charge_tiers?.[0]?.chargePerSite || 0;
                        
                        let total = 0;
                        assets.forEach((asset: any) => {
                          const capacityKwp = (asset.totalMW || 0) * 1000;
                          const capacityMW = asset.totalMW || 0;
                          const isSmall = capacityKwp <= threshold;
                          const rate = isSmall ? belowPrice : abovePrice;
                          const calculated = capacityMW * rate;
                          total += Math.max(calculated, minFee);
                        });
                        return total.toLocaleString();
                      })()}
                    </p>
                  </div>
                </>
              ) : contract.package === "elum_jubaili" ? (
                <>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Per-Site Fee Tiers</p>
                    {contract.minimum_charge_tiers && contract.minimum_charge_tiers.length > 0 ? (
                      <div className="space-y-2 text-sm">
                        {contract.minimum_charge_tiers.map((tier: any, index: number) => {
                          const totalMW = cachedCapabilities?.totalMW || 0;
                          const isApplied = totalMW >= tier.minMW && 
                            (tier.maxMW === null || tier.maxMW === undefined || totalMW <= tier.maxMW);
                          return (
                            <div 
                              key={index} 
                              className={`flex justify-between ${isApplied ? 'font-medium text-primary' : 'text-muted-foreground'}`}
                            >
                              <span>
                                {tier.label || `Tier ${index + 1}`} ({tier.minMW}-{tier.maxMW || '∞'} MW):
                              </span>
                              <span>
                                {contract.currency === 'EUR' ? '€' : '$'}{tier.chargePerSite}/site/year
                                {isApplied && ' ← Current'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="font-medium">
                        {contract.currency === 'EUR' ? '€' : '$'}
                        {contract.annual_fee_per_site?.toLocaleString() || '0'}/site/year
                      </p>
                    )}
                  </div>
                  
                  <Separator />
                  
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Portfolio Summary</p>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>Total Sites:</span>
                        <span className="font-medium">{cachedCapabilities?.totalSites || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total MW:</span>
                        <span className="font-medium">{cachedCapabilities?.totalMW?.toFixed(2) || 0} MW</span>
                      </div>
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Estimated Annual Value</p>
                    <p className="font-medium">
                      {(() => {
                        const totalMW = cachedCapabilities?.totalMW || 0;
                        const totalSites = cachedCapabilities?.totalSites || 0;
                        let perSiteFee = contract.annual_fee_per_site || 0;
                        
                        // Find applicable tier if tiers exist
                        if (contract.minimum_charge_tiers && contract.minimum_charge_tiers.length > 0) {
                          const appliedTier = contract.minimum_charge_tiers.find((tier: any) => 
                            totalMW >= tier.minMW && 
                            (tier.maxMW === null || tier.maxMW === undefined || totalMW <= tier.maxMW)
                          );
                          if (appliedTier) {
                            perSiteFee = appliedTier.chargePerSite;
                          }
                        }
                        
                        return `${contract.currency === 'EUR' ? '€' : '$'}${(totalSites * perSiteFee).toLocaleString()}`;
                      })()}
                    </p>
                  </div>
                </>
              ) : contract.package === "elum_portfolio_os" ? (
                <>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Per MWp Cost</p>
                    <div className="space-y-2">
                      {(contract.modules || []).map((moduleId: string) => {
                        const customPrice = contract.custom_pricing?.[moduleId];
                        const defaultPrices: {[key: string]: number} = {
                          technicalMonitoring: 1000,
                          energySavingsHub: 500,
                          stakeholderPortal: 250,
                          control: 500
                        };
                        const price = customPrice || defaultPrices[moduleId] || 0;
                        
                        return (
                          <div key={moduleId} className="flex justify-between">
                            <span className="text-sm">{moduleNames[moduleId] || moduleId}:</span>
                            <span className="font-medium">
                              {contract.currency === 'EUR' ? '€' : '$'}{price.toLocaleString()}/MWp/year
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Minimum Annual Value</p>
                    <p className="font-medium">{contract.currency === 'EUR' ? '€' : '$'}{(contract.minimum_annual_value || 0).toLocaleString()}</p>
                  </div>
                  
                  <Separator />
                  
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Portfolio Summary</p>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>Total Sites:</span>
                        <span>{cachedCapabilities?.totalSites || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total MW:</span>
                        <span>{(cachedCapabilities?.totalMW || 0).toFixed(2)} MW</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Hybrid Sites:</span>
                        <span>{cachedCapabilities?.hybridSites || 0}</span>
                      </div>
                      {(cachedCapabilities?.sitesWithSolcast || 0) > 0 && (
                        <div className="flex justify-between">
                          <span>Solcast Sites:</span>
                          <span>{cachedCapabilities.sitesWithSolcast}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Estimated Annual Value</p>
                    <p className="font-medium">
                      {(() => {
                        const totalMW = cachedCapabilities?.totalMW || 0;
                        const moduleTotal = (contract.modules || []).reduce((sum: number, moduleId: string) => {
                          const customPrice = contract.custom_pricing?.[moduleId];
                          const defaultPrices: {[key: string]: number} = {
                            technicalMonitoring: 1000,
                            energySavingsHub: 500,
                            stakeholderPortal: 250,
                            control: 500
                          };
                          return sum + (customPrice || defaultPrices[moduleId] || 0);
                        }, 0);
                        const calculatedValue = totalMW * moduleTotal;
                        const minValue = contract.minimum_annual_value || 0;
                        const finalValue = Math.max(calculatedValue, minValue);
                        const currency = contract.currency === 'EUR' ? '€' : '$';
                        
                        if (calculatedValue < minValue) {
                          return (
                            <>
                              {currency}{finalValue.toLocaleString()}
                              <span className="text-sm text-muted-foreground ml-2">(minimum applied)</span>
                            </>
                          );
                        }
                        return `${currency}${finalValue.toLocaleString()}`;
                      })()}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Per MWp Cost</p>
                    <div className="space-y-2">
                      {(contract.modules || []).map((moduleId: string) => {
                        const customPrice = contract.custom_pricing?.[moduleId];
                        const defaultPrices: {[key: string]: number} = {
                          technicalMonitoring: 1000,
                          energySavingsHub: 500,
                          stakeholderPortal: 250,
                          control: 500
                        };
                        const price = customPrice || defaultPrices[moduleId] || 0;
                        
                        return (
                          <div key={moduleId} className="flex justify-between">
                            <span className="text-sm">{moduleNames[moduleId] || moduleId}:</span>
                            <span className="font-medium">
                              {contract.currency === 'EUR' ? '€' : '$'}{price.toLocaleString()}/MWp/year
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Estimated Annual Value</p>
                    {contract.package === "pro" ? (
                      <p className="font-medium">
                        {contract.currency === 'EUR' ? '€' : '$'}{Math.max(5000, (cachedCapabilities?.totalMW || customer?.mwp_managed || contract.initial_mw) * (contract.modules || []).reduce((sum: number, moduleId: string) => {
                          const customPrice = contract.custom_pricing?.[moduleId];
                          const defaultPrices: {[key: string]: number} = {
                            technicalMonitoring: 1000,
                            energySavingsHub: 500,
                            stakeholderPortal: 250,
                            control: 500
                          };
                          return sum + (customPrice || defaultPrices[moduleId] || 0);
                        }, 0)).toLocaleString()}
                      </p>
                    ) : (
                      <p className="font-medium">Custom pricing</p>
                    )}
                  </div>
                </>
              )}
              
              {contract.addons.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Add-on Costs</p>
                    <p className="font-medium">Varies based on complexity and usage</p>
                  </div>
                </>
              )}
              
              <div className="pt-4">
                <Button variant="outline" className="w-full" onClick={() => window.location.href = "/calculator"}>
                  <Calculator className="mr-2 h-4 w-4" />
                  Calculate Invoice
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* AMMP Asset Breakdown Section */}
        {cachedCapabilities?.assetBreakdown && cachedCapabilities.assetBreakdown.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Asset Breakdown</CardTitle>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {contract.last_ammp_sync && (
                    <span>Last sync: {formatDate(contract.last_ammp_sync)}</span>
                  )}
                  {contract.ammp_sync_status && (
                    <Badge variant={contract.ammp_sync_status === 'completed' ? 'default' : 'secondary'}>
                      {contract.ammp_sync_status}
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Last sync attempt kept the previous data — explain why */}
              {(cachedCapabilities as any)?.lastSyncAttempt?.outcome === 'aborted_empty' && (
                <Alert variant="destructive" className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Last sync attempt ({formatDate((cachedCapabilities as any).lastSyncAttempt.at)}) resolved 0 assets, so the
                    previous breakdown below was kept. {(cachedCapabilities as any).lastSyncAttempt.reason}
                  </AlertDescription>
                </Alert>
              )}

              {/* Summary Stats */}
              {(() => {
                const ongridAssets = cachedCapabilities.assetBreakdown?.filter((a: any) => !a.isHybrid) || [];
                const hybridAssets = cachedCapabilities.assetBreakdown?.filter((a: any) => a.isHybrid) || [];
                const solcastAssets = cachedCapabilities.assetBreakdown?.filter((a: any) => a.hasSolcast) || [];
                const ongridMW = ongridAssets.reduce((sum: number, a: any) => sum + (a.totalMW || 0), 0);
                const hybridMW = hybridAssets.reduce((sum: number, a: any) => sum + (a.totalMW || 0), 0);
                const solcastMW = solcastAssets.reduce((sum: number, a: any) => sum + (a.totalMW || 0), 0);
                
                return (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 p-3 bg-muted/50 rounded-lg">
                    <div className="text-center">
                      <p className="text-2xl font-bold">{cachedCapabilities.totalSites || 0}</p>
                      <p className="text-sm font-medium text-muted-foreground">{cachedCapabilities.totalMW?.toFixed(2) || 0} MW</p>
                      <p className="text-xs text-muted-foreground">Total</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold">{ongridAssets.length}</p>
                      <p className="text-sm font-medium text-muted-foreground">{ongridMW.toFixed(2)} MW</p>
                      <p className="text-xs text-muted-foreground">On-Grid</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold">{hybridAssets.length}</p>
                      <p className="text-sm font-medium text-muted-foreground">{hybridMW.toFixed(2)} MW</p>
                      <p className="text-xs text-muted-foreground">Hybrid</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold">{solcastAssets.length}</p>
                      <p className="text-sm font-medium text-muted-foreground">{solcastMW.toFixed(2)} MW</p>
                      <p className="text-xs text-muted-foreground">With Solcast</p>
                    </div>
                  </div>
                );
              })()}

              {/* Device Enrichment Alert */}
              {cachedCapabilities.needsDeviceEnrichment && (
                <Alert className="mb-4 border-amber-200 bg-amber-50 dark:bg-amber-950/20">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="flex items-center justify-between">
                    <span className="text-amber-800 dark:text-amber-200">
                      Device data was skipped for this large portfolio ({cachedCapabilities.totalSites} sites). 
                      {cachedCapabilities.deviceEnrichmentProgress && (
                        <span className="ml-1">
                          Progress: {cachedCapabilities.deviceEnrichmentProgress.processed}/{cachedCapabilities.deviceEnrichmentProgress.total} enriched.
                        </span>
                      )}
                    </span>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleEnrichDevices(false)}
                      disabled={isEnrichingDevices}
                      className="ml-2 border-amber-300 text-amber-700 hover:bg-amber-100"
                    >
                      {isEnrichingDevices ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                          Enriching...
                        </>
                      ) : (
                        <>
                          <Zap className="h-4 w-4 mr-1" />
                          Fetch Device Data
                        </>
                      )}
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              {/* Asset Table Controls */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">
                  {cachedCapabilities.assetBreakdown.length} assets
                  {(() => {
                    const confirmedEmptyAssets = cachedCapabilities.assetBreakdown.filter(
                      (a: any) => a.deviceEnrichmentConfirmedEmpty
                    ).length;
                    const trulyMissingAssets = cachedCapabilities.assetBreakdown.filter(
                      (a: any) => (!a.devices || a.devices.length === 0) && !a.deviceEnrichmentConfirmedEmpty
                    ).length;
                    return (
                      <>
                        {trulyMissingAssets > 0 && (
                          <span className="text-amber-600 ml-1">({trulyMissingAssets} pending device data)</span>
                        )}
                        {confirmedEmptyAssets > 0 && (
                          <span className="text-muted-foreground ml-1">({confirmedEmptyAssets} have no devices in AMMP)</span>
                        )}
                      </>
                    );
                  })()}
                </span>
                <div className="flex items-center gap-2">
                  {cachedCapabilities.needsDeviceEnrichment && !isEnrichingDevices && (
                    <span className="text-xs text-amber-600">
                      Device data pending
                    </span>
                  )}
                  {/* Force Refetch button - shows when there are assets with no devices that aren't confirmed empty */}
                  {cachedCapabilities.assetBreakdown.some((a: any) => (!a.devices || a.devices.length === 0) && !a.deviceEnrichmentConfirmedEmpty) && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleEnrichDevices(false, true)}
                      disabled={isEnrichingDevices}
                      className="text-xs border-amber-300 text-amber-700 hover:bg-amber-100"
                    >
                      {isEnrichingDevices ? (
                        <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Zap className="h-3 w-3 mr-1" />
                      )}
                      Force Refetch Devices
                    </Button>
                  )}
                  {!cachedCapabilities.needsDeviceEnrichment && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleEnrichDevices(true, false)}
                      disabled={isEnrichingDevices}
                      className="text-xs"
                    >
                      {isEnrichingDevices ? (
                        <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3 mr-1" />
                      )}
                      Recalculate Hybrid Status
                    </Button>
                  )}
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setShowAllAssets(!showAllAssets)}
                  >
                    {showAllAssets ? 'Collapse' : 'Show All'}
                  </Button>
                </div>
              </div>

              {/* Elum 2026: per-org resolution audit from the last sync */}
              {orgResolution.length > 0 && (
                <details className="mb-4 border rounded-lg bg-muted/30">
                  <summary className="cursor-pointer p-3 text-sm font-medium">
                    Org resolution ({orgResolution.length} sources,{' '}
                    {orgResolution.reduce((s: number, o: any) => s + (o.assetCount || 0), 0)} assets)
                    {emptyOrgs.length > 0 && (
                      <span className="ml-2 text-destructive">- {emptyOrgs.length} returned no assets</span>
                    )}
                  </summary>
                  <div className="max-h-64 overflow-auto border-t">
                    <table className="w-full text-xs">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="text-left p-2 font-medium">Organisation / group</th>
                          <th className="text-right p-2 font-medium">Assets</th>
                          <th className="text-left p-2 font-medium">Resolved via</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orgResolution.map((o: any) => (
                          <tr key={o.orgId} className="border-t align-top">
                            <td className="p-2">
                              {o.orgName || o.orgId}
                              {o.zeroCapacity ? (
                                <div className="text-xs text-muted-foreground mt-1">
                                  {o.zeroCapacity} zero-capacity site(s) — still billed
                                  {o.zeroCapacityAssets?.length ? (
                                    <>: {o.zeroCapacityAssets.map((a: any) => a.assetName).join(', ')}</>
                                  ) : null}
                                </div>
                              ) : null}
                            </td>
                            <td className={`p-2 text-right ${o.assetCount === 0 ? 'text-destructive font-medium' : ''}`}>
                              {o.assetCount}
                            </td>
                            <td className="p-2 text-muted-foreground">
                              {o.source}
                              <div className="text-[11px]">
                                {String(o.source || '').includes('ignored-flag-only')
                                  ? 'ignored — internal is resolved from feature flags only'
                                  : String(o.source || '').includes('feature-flag')
                                    ? 'feature flag'
                                    : String(o.source || '').includes('group')
                                      ? 'legacy asset group'
                                      : 'organisation'}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {tierConflictOrgs.length > 0 && (
                    <div className="p-3 border-t text-xs text-muted-foreground space-y-1">
                      <div className="font-medium text-foreground">
                        {tierConflictOrgs.length} sub-org(s) with conflicting billing tier flags
                      </div>
                      <ul className="space-y-1">
                        {tierConflictOrgs.map((o: any) => (
                          <li key={o.orgId}>
                            <span className="font-medium">{o.orgName || o.orgId}</span> — {(o.tiers || []).join(' + ')}
                          </li>
                        ))}
                      </ul>
                      <div>Remove the extra flag in AMMP so each org has exactly one tier.</div>
                    </div>
                  )}
                  {excludedOrgs.length > 0 && (
                    <div className="p-3 border-t text-xs text-muted-foreground">
                      Excluded from billing (never counted, whatever their flags):{' '}
                      {excludedOrgs
                        .map((o: any) =>
                          o.assetCount
                            ? `${o.orgName || o.orgId} (${o.assetCount} asset${o.assetCount === 1 ? '' : 's'} removed${o.source ? `, via ${o.source}` : ''})`
                            : (o.orgName || o.orgId)
                        )
                        .join(', ')}
                    </div>
                  )}
                  {unassignedOrgs.length > 0 && (() => {
                    const verified = unassignedOrgs.filter((o: any) => !o.partial);
                    const unverified = unassignedOrgs.length - verified.length;
                    const totalUncovered = verified.reduce((s: number, o: any) => s + (o.uncovered || 0), 0);
                    const totalAssets = verified.reduce((s: number, o: any) => s + (o.assetCount || 0), 0);
                    return (
                      <div className="p-3 border-t text-xs text-muted-foreground space-y-2">
                        <div>
                          <span className={`font-medium ${totalUncovered > 0 ? 'text-destructive' : 'text-foreground'}`}>
                            {unassignedOrgs.length} sub-org(s) without a tier flag
                          </span>{' '}
                          holding {totalAssets} assets —{' '}
                          {totalUncovered > 0
                            ? `${totalUncovered} not covered by the legacy asset group`
                            : 'all covered by the legacy asset group'}
                          {unverified > 0 ? ` (${unverified} org(s) not verified this sync)` : ''}
                        </div>

                        <ul className="space-y-1">
                          {unassignedOrgs.map((o: any) => (
                            <li key={o.orgId} className={o.uncovered > 0 ? 'text-destructive' : ''}>
                              <span className="font-medium">{o.orgName || o.orgId}</span> — {o.assetCount || 0} assets
                              {o.placeholders ? ` (+${o.placeholders} empty AMMP stub assets ignored)` : ''}

                              {o.partial ? (
                                <>: coverage not verified (sync ran out of time — re-sync to complete)</>

                              ) : (
                                <>
                                  : {(o.coveredStandard || 0) + (o.coveredEconf || 0)} covered by legacy group
                                  {o.coveredEconf ? ` (${o.coveredEconf} eConf)` : ''}
                                  {o.coveredElsewhere ? `, ${o.coveredElsewhere} covered by another tier's group` : ''}
                                  {typeof o.excluded === 'number' && o.excluded > 0 ? `, ${o.excluded} excluded` : ''}
                                  , {o.uncovered || 0} not covered
                                  {o.uncoveredMW ? ` (${o.uncoveredMW.toFixed(2)} MWp)` : ''}
                                  {o.coveredElsewhereAssets?.length ? (
                                    <span className="block pl-3 opacity-70">
                                      Other tier: {o.coveredElsewhereAssets.map((a: any) => `${a.assetName} (${a.tierName})`).join(', ')}
                                      {o.coveredElsewhere > o.coveredElsewhereAssets.length ? ', …' : ''}
                                    </span>
                                  ) : null}
                                  {o.uncoveredAssets?.length ? (
                                    <span className="block pl-3 opacity-80">
                                      {o.uncoveredAssets.map((a: any) => a.assetName).join(', ')}
                                      {o.uncovered > o.uncoveredAssets.length ? ', …' : ''}
                                    </span>
                                  ) : null}
                                  {o.siblingIncomplete ? (
                                    <span className="block pl-3 opacity-70">
                                      Partially verified — another tier's asset group could not be read from AMMP, so some assets may show as not covered.
                                    </span>
                                  ) : null}

                                </>

                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })()}

                </details>
              )}

              {/* Jubaili genset rating summary */}
              {contract?.package === 'elum_jubaili' && (() => {
                const assets = cachedCapabilities.assetBreakdown as any[];
                const rated = assets.filter(a => a.gensetKVA != null && a.gensetKVA > 0);
                const zero = assets.filter(a => a.gensetKVA === 0);
                const unset = assets.filter(a => a.gensetKVA == null);
                return (
                  <div className="mb-3 text-sm rounded-lg border p-3 space-y-1">
                    <div className="font-medium">Genset ratings (from AMMP)</div>
                    <div className="text-muted-foreground">
                      {rated.length} rated · {zero.length} rated 0 kVA · {unset.length} not set in AMMP
                    </div>
                    {unset.length > 0 && (
                      <div className="text-destructive text-xs">
                        Sites without a rating are not billed. Re-sync the contract after the ratings are set in AMMP.
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* PV capacity sanity check */}
              <div className="mb-3 rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-medium text-sm">PV capacity sanity check</div>
                    <p className="text-xs text-muted-foreground">
                      Compares the registered kWp against the peak output observed in AMMP over the last 365 days.
                      Sites without data are reported separately — that is common and not an error.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={runCapacitySanityCheck}
                    disabled={isCheckingCapacity}
                  >
                    {isCheckingCapacity ? 'Checking…' : 'Run capacity sanity check'}
                  </Button>
                </div>

                {capacityCheck && (
                  <div className="text-xs space-y-1">
                    <div className="text-muted-foreground">
                      {capacityCheck.checked} of {capacityCheck.totalAssets} site(s) checked ·{' '}
                      {capacityCheck.suspiciousCount} suspicious · {capacityCheck.noDataCount} without data
                      {capacityCheck.errorCount ? ` · ${capacityCheck.errorCount} failed` : ''}
                      {capacityCheck.truncated ? ' · stopped early (time budget)' : ''}
                    </div>
                    {(capacityCheck.errorSample?.length ?? 0) > 0 && (
                      <ul className="space-y-0.5 text-destructive">
                        {capacityCheck.errorSample!.map((m, i) => (
                          <li key={i}>Request failed: {m}</li>
                        ))}
                      </ul>
                    )}
                    {capacityCheck.suspiciousCount > 0 && (
                      <ul className="space-y-0.5">
                        {capacityCheck.results
                          .filter(r => r.verdict === 'too_low' || r.verdict === 'too_high')
                          .slice(0, 20)
                          .map(r => (
                            <li key={r.assetId} className="text-destructive">
                              {r.assetName}: {r.registeredKWp.toFixed(1)} kWp registered vs ~
                              {(r.observedKWp ?? 0).toFixed(1)} kWp observed
                              {r.ratio != null ? ` (ratio ${r.ratio.toFixed(2)})` : ''}
                            </li>
                          ))}
                      </ul>
                    )}
                  </div>
                )}

              </div>

              {/* Asset Table */}
              <div className={`${showAllAssets ? '' : 'max-h-96'} overflow-auto border rounded-lg`}>
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left p-2 font-medium">Asset Name</th>
                      {showCategoryColumn && <th className="text-left p-2 font-medium">Category</th>}
                      <th className="text-right p-2 font-medium">MW</th>
                      {contract?.package === 'elum_jubaili' && (
                        <th className="text-right p-2 font-medium">Genset (kVA)</th>
                      )}
                      <th className="text-center p-2 font-medium">Hybrid</th>
                      <th className="text-center p-2 font-medium">Solcast</th>
                      <th className="text-center p-2 font-medium">Discount</th>
                      <th className="text-center p-2 font-medium" title="Ignore this site for zero-capacity alerts and warnings">Ignore</th>
                      <th className="text-right p-2 font-medium">Devices</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cachedCapabilities.assetBreakdown.map((asset: any) => {
                      const discount = getAssetDiscount(asset.assetId);
                      const category = assetCategoryMap.get(asset.assetId);
                      const ignored = isAssetIgnoredLive(asset.assetId);
                      return (
                        <tr 
                          key={asset.assetId} 
                          className={`border-t hover:bg-muted/50 cursor-pointer ${discount ? 'bg-amber-50/50 dark:bg-amber-950/10' : ''} ${ignored ? 'opacity-60' : ''}`}
                          onClick={() => setSelectedAsset(asset)}
                        >
                          <td className="p-2">
                            {asset.assetName}
                            {ignored && (
                              <Badge variant="outline" className="ml-2 text-xs">Ignored</Badge>
                            )}
                            {asset.isBatteryOnly && (
                              <Badge
                                variant="outline"
                                className="ml-2 text-xs"
                                title="Storage devices but no PV inverter — 0 MWp is expected here"
                              >
                                Battery-only
                                {asset.batteryCapacityKWh != null
                                  ? ` · ${Number(asset.batteryCapacityKWh).toFixed(0)} kWh`
                                  : ''}
                              </Badge>
                            )}
                            {capacityCheckByAsset.get(asset.assetId) && (
                              <Badge
                                variant="outline"
                                className="ml-2 text-xs text-destructive border-destructive/40"
                                title={`Observed ~${(capacityCheckByAsset.get(asset.assetId)!.observedKWp ?? 0).toFixed(1)} kWp vs ${capacityCheckByAsset.get(asset.assetId)!.registeredKWp.toFixed(1)} kWp registered`}
                              >
                                {capacityCheckByAsset.get(asset.assetId)!.verdict === 'too_low'
                                  ? 'Capacity looks too high'
                                  : 'Capacity looks too low'}
                              </Badge>
                            )}
                          </td>

                          {showCategoryColumn && (
                            <td className="p-2">
                              {category ? (
                                <div className="flex flex-col gap-0.5">
                                  <span>{category.label}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {category.isLegacy ? 'Legacy asset group' : elumTierLabel(category.tier)}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">Unassigned</span>
                              )}
                            </td>
                          )}
                          <td className="p-2 text-right">{asset.totalMW?.toFixed(4)}</td>
                          {contract?.package === 'elum_jubaili' && (
                            <td className="p-2 text-right">
                              {asset.gensetKVA == null ? (
                                <span className="text-destructive text-xs">Not set</span>
                              ) : (
                                asset.gensetKVA.toLocaleString(undefined, { maximumFractionDigits: 1 })
                              )}
                            </td>
                          )}
                          <td className="p-2 text-center">
                            {asset.isHybrid ? <Badge variant="outline" className="bg-purple-50">Yes</Badge> : '-'}
                          </td>
                          <td className="p-2 text-center">
                            {asset.hasSolcast ? <Badge variant="outline" className="bg-blue-50">Yes</Badge> : '-'}
                          </td>
                          <td className="p-2 text-center">
                            {discount ? (
                              <DiscountBadge 
                                pricingType={discount.pricingType} 
                                price={discount.price} 
                                currency={(contract?.currency || 'EUR') as 'EUR' | 'USD'} 
                              />
                            ) : (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-6 px-2 text-xs"
                                onClick={(e) => openDiscountDialog(asset, e)}
                              >
                                <Percent className="h-3 w-3 mr-1" />
                                Add
                              </Button>
                            )}
                          </td>
                          <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                            <Switch
                              checked={ignored}
                              onCheckedChange={() => toggleIgnoredAsset(asset.assetId, asset.assetName)}
                              aria-label={`Ignore ${asset.assetName} for alerts`}
                            />
                          </td>
                          <td className="p-2 text-right">{asset.deviceCount || '-'}</td>

                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Asset Discount Dialog */}
              <AssetDiscountDialog
                open={discountDialogOpen}
                onOpenChange={setDiscountDialogOpen}
                asset={discountEditAsset}
                currentDiscount={discountEditAsset ? getAssetDiscount(discountEditAsset.assetId) : undefined}
                currency={(contract?.currency || 'EUR') as 'EUR' | 'USD'}
                onSave={handleSaveAssetDiscount}
              />

              {/* Device Details Dialog */}
              <Dialog open={!!selectedAsset} onOpenChange={() => setSelectedAsset(null)}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{selectedAsset?.assetName}</DialogTitle>
                    <DialogDescription className="space-y-1">
                      <span className="font-mono text-xs">{selectedAsset?.assetId}</span>
                      <div>
                        {selectedAsset?.totalMW?.toFixed(4)} MW • {selectedAsset?.deviceCount || 0} devices
                        {selectedAsset?.isHybrid && <Badge variant="outline" className="ml-2 bg-purple-50">Hybrid</Badge>}
                        {selectedAsset?.hasSolcast && <Badge variant="outline" className="ml-2 bg-blue-50">Solcast</Badge>}
                        {selectedAsset && assetCategoryMap.get(selectedAsset.assetId) && (
                          <Badge variant="outline" className="ml-2">
                            {assetCategoryMap.get(selectedAsset.assetId)!.label}
                            {' · '}
                            {assetCategoryMap.get(selectedAsset.assetId)!.isLegacy
                              ? 'Legacy asset group'
                              : elumTierLabel(assetCategoryMap.get(selectedAsset.assetId)!.tier)}
                          </Badge>
                        )}
                      </div>
                    </DialogDescription>
                  </DialogHeader>
                  
                  {selectedAsset?.devices && selectedAsset.devices.length > 0 ? (
                    <div className="border rounded-lg overflow-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted sticky top-0">
                          <tr>
                            <th className="text-left p-2 font-medium">Device Name</th>
                            <th className="text-left p-2 font-medium">Type</th>
                            <th className="text-left p-2 font-medium">Manufacturer</th>
                            <th className="text-left p-2 font-medium">Model</th>
                            <th className="text-left p-2 font-medium">Data Provider</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedAsset.devices.map((device: any) => (
                            <tr key={device.deviceId} className="border-t hover:bg-muted/30">
                              <td className="p-2 font-medium">{device.deviceName}</td>
                              <td className="p-2">{device.deviceType}</td>
                              <td className="p-2">{device.manufacturer || '-'}</td>
                              <td className="p-2">{device.model || '-'}</td>
                              <td className="p-2">{device.dataProvider || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-8">
                      No device data available. Re-sync the contract to fetch device details.
                    </p>
                  )}
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        )}

        {/* AMMP Configuration Info (when no assets synced yet) */}
        {hasAMMPData && (!cachedCapabilities?.assetBreakdown || cachedCapabilities.assetBreakdown.length === 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">AMMP Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                {contract.ammp_org_id && (
                  <p><span className="text-muted-foreground">Org ID:</span> {contract.ammp_org_id}</p>
                )}
                {contract.ammp_asset_group_id && (
                  <p><span className="text-muted-foreground">Asset Group:</span> {contract.ammp_asset_group_name || contract.ammp_asset_group_id}</p>
                )}
                <p className="text-muted-foreground mt-4">
                  Click "Sync AMMP" to fetch asset data for this contract.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Asset Status History Timeline */}
        {hasAMMPData && cachedCapabilities?.assetBreakdown && cachedCapabilities.assetBreakdown.length > 0 && (
          <AssetStatusTimeline 
            contractId={contract.id}
            suspiciousThresholdDays={30}
          />
        )}

        {/* Contract Amendments Section */}
        <ContractAmendments
          contractId={contract.id}
          originalContract={{
            signed_date: contract.signed_date,
            contract_pdf_url: contract.contract_pdf_url,
          }}
        />
      </div>
    </Layout>
  );
};

export default ContractDetails;

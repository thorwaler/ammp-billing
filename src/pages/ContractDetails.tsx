
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FileText, Download, Edit, Clock, Calculator, MoreVertical } from "lucide-react";
import ContractForm from "@/components/contracts/ContractForm";
import ContractAmendments from "@/components/contracts/ContractAmendments";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

// Helper function to map module IDs to names
const moduleNames: {[key: string]: string} = {
  technicalMonitoring: "Technical Monitoring",
  energySavingsHub: "Energy Savings Hub",
  stakeholderPortal: "Stakeholder Portal",
  control: "Control"
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
  spCustomReport: "Custom Report"
};

// Helper function to format date
const formatDate = (dateString: string) => {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString();
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

  const loadContractData = async () => {
      setLoading(true);
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
              location,
              mwp_managed,
              status
            )
          `)
          .eq('id', id)
          .eq('user_id', user.id)
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
          .eq('user_id', user.id)
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('contracts')
        .update({ contract_status: newStatus })
        .eq('id', contract.id)
        .eq('user_id', user.id);

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

  const handleExtendContract = () => {
    // Would handle contract extension logic
    setShowExtendDialog(false);
    toast({
      title: "Contract extended",
      description: `${contract?.companyName}'s contract has been extended`,
    });
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
    // Use period_end for contract expiration, not next_invoice_date
    if (!contract.period_end) return null;
    const today = new Date();
    const expiration = new Date(contract.period_end);
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
          
          <div className="flex gap-2">
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
                    mwpManaged: customer.mwp_managed
                  } : undefined}
                  existingContract={{
                    id: contract.id,
                    contractName: contract.contract_name,
                    package: contract.package,
                    modules: contract.modules || [],
                    addons: contract.addons || [],
                    initialMW: contract.initial_mw,
                    billingFrequency: contract.billing_frequency || 'annual',
                    manualInvoicing: contract.manual_invoicing,
                    nextInvoiceDate: contract.next_invoice_date,
                    customPricing: contract.custom_pricing,
                    volumeDiscounts: contract.volume_discounts,
                    minimumCharge: contract.minimum_charge,
                    minimumAnnualValue: contract.minimum_annual_value,
                    baseMonthlyPrice: contract.base_monthly_price,
                    maxMw: contract.max_mw,
                    currency: contract.currency || 'EUR',
                    signedDate: contract.signed_date,
                    contractExpiryDate: contract.contract_expiry_date,
                    periodStart: contract.period_start,
                    periodEnd: contract.period_end,
                    notes: contract.notes,
                    contractStatus: contract.contract_status,
                    portfolioDiscountTiers: contract.portfolio_discount_tiers,
                    minimumChargeTiers: contract.minimum_charge_tiers,
                    siteChargeFrequency: contract.site_charge_frequency,
                    retainerHours: contract.retainer_hours,
                    retainerHourlyRate: contract.retainer_hourly_rate,
                    retainerMinimumValue: contract.retainer_minimum_value
                  }}
                  onComplete={() => {
                    setShowEditDialog(false);
                    loadContractData();
                  }}
                  onCancel={() => setShowEditDialog(false)}
                />
              </DialogContent>
            </Dialog>
            
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
              mwpManaged: customer?.mwp_managed || contract.initial_mw
            }}
            existingContract={{
              id: contract.id,
              contractName: contract.contract_name,
              package: contract.package,
              modules: contract.modules || [],
              addons: contract.addons || [],
              initialMW: contract.initial_mw,
              billingFrequency: contract.billing_frequency || 'annual',
              manualInvoicing: contract.manual_invoicing,
              nextInvoiceDate: contract.next_invoice_date,
              customPricing: contract.custom_pricing,
              volumeDiscounts: contract.volume_discounts,
              minimumCharge: contract.minimum_charge,
              minimumAnnualValue: contract.minimum_annual_value,
              baseMonthlyPrice: contract.base_monthly_price,
              maxMw: contract.max_mw,
              currency: contract.currency || 'EUR',
              signedDate: contract.signed_date,
              contractExpiryDate: contract.contract_expiry_date,
              periodStart: contract.period_start,
              periodEnd: contract.period_end,
              notes: contract.notes,
              contractStatus: contract.contract_status,
              portfolioDiscountTiers: contract.portfolio_discount_tiers,
                    minimumChargeTiers: contract.minimum_charge_tiers,
                    siteChargeFrequency: contract.site_charge_frequency,
                    retainerHours: contract.retainer_hours,
                    retainerHourlyRate: contract.retainer_hourly_rate,
                    retainerMinimumValue: contract.retainer_minimum_value
                  }}
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
              </DropdownMenuContent>
            </DropdownMenu>
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
                    {contract.package === "starter" ? "AMMP OS Starter" : 
                     contract.package === "pro" ? "AMMP OS Pro" : 
                     contract.package === "hybrid_tiered" ? "Hybrid Tiered" : "Custom/Legacy"}
                  </p>
                </div>
                
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Status</p>
                  <div className="flex items-center space-x-2">
                    <Badge variant={contract.contract_status === "active" ? "default" : "secondary"}>
                      {contract.contract_status}
                    </Badge>
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
                  <p className="font-medium">{customer?.mwp_managed || contract.initial_mw} MWp</p>
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
                    <p className="font-medium">${contract.minimum_charge}</p>
                  </div>
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
                              ${price.toLocaleString()}/MWp/year
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
                        ${Math.max(5000, (customer?.mwp_managed || contract.initial_mw) * (contract.modules || []).reduce((sum: number, moduleId: string) => {
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

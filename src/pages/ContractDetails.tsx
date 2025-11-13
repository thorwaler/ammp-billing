
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FileText, Download, Edit, Clock, Calculator } from "lucide-react";
import ContractForm from "@/components/contracts/ContractForm";
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

  useEffect(() => {
    const loadContractDetails = async () => {
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

    loadContractDetails();
  }, [id]);

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
    if (!contract.next_invoice_date) return null;
    const today = new Date();
    const expiration = new Date(contract.next_invoice_date);
    const diffTime = expiration.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const expirationStatus = () => {
    const days = daysUntilExpiration();
    if (days === null) return { label: "No expiration set", variant: "secondary" };
    if (days < 0) return { label: "Expired", variant: "destructive" };
    if (days < 30) return { label: `Expires in ${days} days`, variant: "destructive" };
    if (days < 90) return { label: `Expires in ${days} days`, variant: "warning" };
    return { label: `Expires in ${days} days`, variant: "default" };
  };

  const companyName = customer?.name || contract.company_name || "Unknown Company";

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center">
              <FileText className="h-8 w-8 mr-2 text-ammp-blue" />
              <h1 className="text-3xl font-bold tracking-tight">{companyName}</h1>
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
            
            <Dialog>
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
                  existingContractId={contract.id}
                  onComplete={() => {
                    window.location.reload();
                  }}
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
                  <DialogTitle>Extend Contract - {contract.companyName}</DialogTitle>
                </DialogHeader>
                <ContractForm />
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
                    {contract.package === "starter" ? "AMMP OS Starter" : 
                     contract.package === "pro" ? "AMMP OS Pro" : "Custom/Legacy"}
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
                  <p className="text-sm text-muted-foreground">Billing Frequency</p>
                  <p className="font-medium capitalize">
                    {contract.billing_frequency || 'Annual'}
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
                  <p className="font-medium">$3,000</p>
                </div>
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
      </div>
    </Layout>
  );
};

export default ContractDetails;

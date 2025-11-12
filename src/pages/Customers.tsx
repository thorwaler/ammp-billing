
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import CustomerCard from "@/components/customers/CustomerCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlusCircle, Search, Users, RefreshCw, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import CustomerForm from "@/components/customers/CustomerForm";
import { useCurrency } from "@/contexts/CurrencyContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface CustomerData {
  id: string;
  name: string;
  location: string;
  contractValueUSD: number;
  mwpManaged: number;
  status: "active" | "pending" | "inactive";
  addOns: string[];
  joinDate: string;
  lastInvoiced: string;
  contractId: string;
}


const Customers = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddCustomerForm, setShowAddCustomerForm] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [customersData, setCustomersData] = useState<CustomerData[]>([]);
  const navigate = useNavigate();
  const { formatCurrency, convertToDisplayCurrency } = useCurrency();

  // Load customers from database
  useEffect(() => {
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
          contracts (
            id,
            modules,
            addons
          )
        `)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error loading customers:', error);
        return;
      }

      const transformed: CustomerData[] = (data || []).map(c => {
        const contract = c.contracts?.[0];
        const modules = Array.isArray(contract?.modules) ? contract.modules as string[] : [];
        const addons = Array.isArray(contract?.addons) ? (contract.addons as any[]).map((a: any) => a.id || a) : [];
        
        return {
          id: c.id,
          name: c.name,
          location: c.location || 'N/A',
          contractValueUSD: 0, // Calculate from contract
          mwpManaged: Number(c.mwp_managed) || 0,
          status: (c.status || 'active') as "active" | "pending" | "inactive",
          addOns: [...modules, ...addons],
          joinDate: c.join_date || new Date().toISOString(),
          lastInvoiced: c.last_invoiced || new Date().toISOString(),
          contractId: contract?.id || ''
        };
      });

      setCustomersData(transformed);
    };

    loadCustomers();
  }, []);
  
  const handleSyncFromXero = async () => {
    setIsSyncing(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('xero-sync-customers');
      
      if (error) throw error;
      
      toast({
        title: "Sync complete",
        description: `Successfully synced ${data.syncedCount} customers from Xero.`,
      });
      
      // Reload the page to show updated customers
      setTimeout(() => {
        window.location.reload();
      }, 1500);
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

  const filteredCustomers = customersData.filter(
    (customer) =>
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.location.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center">
              <Users className="h-8 w-8 mr-2 text-ammp-blue" />
              Customers
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage your customer portfolio and contracts
            </p>
          </div>
          <div className="flex gap-2">
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
                <CustomerForm onComplete={() => setShowAddCustomerForm(false)} />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search customers..."
            className="pl-8 max-w-md"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredCustomers.map((customer) => (
            <CustomerCard 
              key={customer.id} 
              {...customer}
              contractValue={`${formatCurrency(convertToDisplayCurrency(customer.contractValueUSD))}/MWp`}
              onViewContract={() => navigate(`/contracts/${customer.contractId}`)} 
              onViewDetails={() => navigate(`/customers/${customer.id}`)} 
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

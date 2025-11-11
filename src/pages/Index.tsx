
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import StatCard from "@/components/dashboard/StatCard";
import RecentActivity from "@/components/dashboard/RecentActivity";
import CustomerCard from "@/components/customers/CustomerCard";
import InvoiceCalculator from "@/components/dashboard/InvoiceCalculator";
import { Users, FileText, BarChart4, DollarSign, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { useCurrency } from "@/contexts/CurrencyContext";

const customers = [
  {
    id: "cust-001",  // Added id property
    name: "Solar Universe Inc.",
    location: "California, USA",
    contractValueUSD: 45000,
    mwpManaged: 42.5,
    status: "active" as const,
    addOns: ["Monitoring", "Analytics"],
  },
  {
    id: "cust-002",  // Added id property
    name: "GreenPower Systems",
    location: "Texas, USA",
    contractValueUSD: 42500,
    mwpManaged: 35.2,
    status: "active" as const,
    addOns: ["Monitoring", "Maintenance"],
  },
];

// Current quarter calculation
const getCurrentQuarter = () => {
  const month = new Date().getMonth();
  return Math.floor(month / 3) + 1;
};

const getCurrentQuarterRange = () => {
  const now = new Date();
  const currentQuarter = getCurrentQuarter();
  const year = now.getFullYear();
  
  // Calculate start and end dates for the quarter
  const startMonth = (currentQuarter - 1) * 3;
  const endMonth = startMonth + 2;
  
  const startDate = new Date(year, startMonth, 1);
  const endDate = new Date(year, endMonth + 1, 0); // Last day of end month
  
  return {
    start: startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    end: endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  };
};

const Index = () => {
  const navigate = useNavigate();
  const quarterRange = getCurrentQuarterRange();
  const { formatCurrency, convertToDisplayCurrency } = useCurrency();
  
  const handleAddContract = () => {
    navigate("/contracts");
    // Small delay to open the dialog after navigation
    setTimeout(() => {
      document.getElementById("add-contract-button")?.click();
    }, 100);
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Welcome to AMMP Contract Compass. Manage your contracts, customers and invoices.
          </p>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Total Customers"
            value="12"
            icon={Users}
            trend="up"
            trendValue="+2 this quarter"
          />
          <StatCard
            title="Active Contracts"
            value="28"
            icon={FileText}
            trend="up"
            trendValue="+3 this quarter"
          />
          <StatCard
            title="Total MWp Managed"
            value="254.8"
            icon={BarChart4}
            trend="up"
            trendValue="+15.3 this quarter"
          />
          <StatCard
            title="Quarterly Revenue"
            value={formatCurrency(convertToDisplayCurrency(32450))}
            icon={DollarSign}
            trend="up"
            trendValue="+8% vs last quarter"
          />
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2">
            <Card className="w-full">
              <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2">
                  <FileText className="h-5 w-5 text-ammp-blue" />
                  Contract Management
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center py-10">
                <div className="text-center space-y-4">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                  <h3 className="text-lg font-medium">Create a new customer contract</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    Add a new contract with detailed pricing, modules, and add-ons to better manage your customer relationships.
                  </p>
                  <Button onClick={handleAddContract} className="mt-2">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Create New Contract
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
          <div>
            <RecentActivity />
          </div>
        </div>

        {/* Quarterly Overview Section */}
        <div>
          <h2 className="text-xl font-semibold mb-2">Quarterly Overview</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Q{getCurrentQuarter()} ({quarterRange.start} - {quarterRange.end})
          </p>
        </div>

        {/* Customers and Calculator */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2">
            <div>
              <h2 className="text-xl font-semibold mb-4">Key Customers</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {customers.map((customer) => (
                  <CustomerCard 
                    key={customer.name} 
                    {...customer}
                    contractValue={`${formatCurrency(convertToDisplayCurrency(customer.contractValueUSD))}/MWp`}
                  />
                ))}
              </div>
            </div>
          </div>
          <div>
            <InvoiceCalculator />
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Index;

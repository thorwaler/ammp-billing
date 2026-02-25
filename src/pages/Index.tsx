import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import StatCard from "@/components/dashboard/StatCard";
import RecentActivity from "@/components/dashboard/RecentActivity";
import InvoiceCalculator from "@/components/dashboard/InvoiceCalculator";
import { Users, FileText, BarChart4, TrendingUp, PlusCircle, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { checkAllContractExpirations } from "@/utils/contractExpiration";
import { getDashboardStats, DashboardStats, getMWGrowthByMonth } from "@/services/analytics/dashboardAnalytics";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

// Current quarter calculation
const getCurrentQuarter = () => {
  const month = new Date().getMonth();
  return Math.floor(month / 3) + 1;
};

const getQuarterDates = () => {
  const now = new Date();
  const currentQuarter = Math.floor(now.getMonth() / 3);
  const year = now.getFullYear();
  const startMonth = currentQuarter * 3;
  const endMonth = startMonth + 2;
  return {
    start: new Date(year, startMonth, 1),
    end: new Date(year, endMonth + 1, 0),
    startLabel: new Date(year, startMonth, 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    endLabel: new Date(year, endMonth + 1, 0).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
  };
};

const Index = () => {
  const navigate = useNavigate();
  const quarterDates = getQuarterDates();
  const { user } = useAuth();
  const { currency, convertToDisplayCurrency } = useCurrency();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mwGrowthData, setMwGrowthData] = useState<{ month: string; mw: number }[]>([]);
  const [revenueData, setRevenueData] = useState<{ month: string; revenue: number }[]>([]);
  
  // Calculate total ARR in display currency
  const displayARR = (() => {
    if (!stats?.totalARR) return 0;
    const { eurTotal, usdTotal } = stats.totalARR;
    const eurInDisplay = convertToDisplayCurrency(eurTotal, "EUR");
    const usdInDisplay = convertToDisplayCurrency(usdTotal, "USD");
    return eurInDisplay + usdInDisplay;
  })();
  
  const currencySymbol = currency === "EUR" ? "€" : "$";
  
  // Fetch real dashboard stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        setIsLoading(true);
        const [dashboardStats, mwData] = await Promise.all([
          getDashboardStats(),
          getMWGrowthByMonth({ startDate: quarterDates.start, endDate: quarterDates.end }),
        ]);
        setStats(dashboardStats);
        setMwGrowthData(mwData.map(d => ({ month: d.month, mw: d.mw })));

        // Fetch invoiced revenue for the quarter
        const { data: invoices } = await supabase
          .from('invoices')
          .select('invoice_date, invoice_amount_eur, invoice_amount')
          .gte('invoice_date', quarterDates.start.toISOString())
          .lte('invoice_date', quarterDates.end.toISOString());

        if (invoices && invoices.length > 0) {
          const monthlyRevenue = new Map<string, number>();
          invoices.forEach(inv => {
            const monthKey = format(new Date(inv.invoice_date), 'MMM yy');
            const amount = inv.invoice_amount_eur ?? inv.invoice_amount ?? 0;
            monthlyRevenue.set(monthKey, (monthlyRevenue.get(monthKey) || 0) + Number(amount));
          });
          setRevenueData(Array.from(monthlyRevenue.entries()).map(([month, revenue]) => ({ month, revenue: parseFloat(revenue.toFixed(2)) })));
        }
      } catch (error) {
        console.error('Error fetching dashboard stats:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    if (user?.id) {
      fetchStats();
    }
  }, [user?.id]);
  
  // Check contract expirations on dashboard load
  useEffect(() => {
    if (user?.id) {
      checkAllContractExpirations(user.id).catch(err => {
        console.error('Error checking contract expirations:', err);
      });
    }
  }, [user?.id]);
  
  const handleAddContract = () => {
    navigate("/contracts");
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
            Welcome to AMMP Revenue & Invoicing. Manage your contracts, customers and invoices.
          </p>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            title="Total Customers"
            value={isLoading ? "..." : String(stats?.totalCustomers || 0)}
            icon={Users}
            trend={stats?.customersAddedThisQuarter ? "up" : "neutral"}
            trendValue={stats?.customersAddedThisQuarter ? `+${stats.customersAddedThisQuarter} this quarter` : "No change"}
          />
          <StatCard
            title="Active Contracts"
            value={isLoading ? "..." : String(stats?.activeContracts || 0)}
            icon={FileText}
            trend={stats?.contractsAddedThisQuarter ? "up" : "neutral"}
            trendValue={stats?.contractsAddedThisQuarter ? `+${stats.contractsAddedThisQuarter} this quarter` : "No change"}
          />
          <StatCard
            title="Total MWp Managed"
            value={isLoading ? "..." : (stats?.totalMWpManaged?.toFixed(1) || "0")}
            icon={BarChart4}
            trend={stats?.mwAddedThisQuarter ? "up" : "neutral"}
            trendValue={stats?.mwAddedThisQuarter ? `+${stats.mwAddedThisQuarter.toFixed(1)} this quarter` : "No change"}
          />
          <StatCard
            title="MW Added This Year"
            value={isLoading ? "..." : `${(stats?.mwAddedThisYear || 0).toFixed(1)} MW`}
            icon={TrendingUp}
            trend={(stats?.mwAddedThisYear || 0) > 0 ? "up" : "neutral"}
            description="Based on AMMP asset onboarding dates"
          />
          <StatCard
            title="Annual Recurring Revenue"
            value={isLoading ? "..." : `${currencySymbol}${(displayARR / 1000).toFixed(0)}k`}
            icon={DollarSign}
            trend="neutral"
            description="Total ARR from active contracts"
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
            Q{getCurrentQuarter()} ({quarterDates.startLabel} - {quarterDates.endLabel})
          </p>
        </div>

        {/* Quarterly Charts + Invoice Calculator */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* MW Added Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">MW Added This Quarter</CardTitle>
              </CardHeader>
              <CardContent>
                {mwGrowthData.length > 0 ? (
                  <ChartContainer config={{ mw: { label: "MW Added", color: "hsl(var(--primary))" } }} className="h-[200px] w-full">
                    <BarChart data={mwGrowthData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="month" className="text-xs" />
                      <YAxis className="text-xs" />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="mw" fill="var(--color-mw)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                ) : (
                  <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                    No MW growth data this quarter
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Invoiced Revenue Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Invoiced Revenue (Q{getCurrentQuarter()})</CardTitle>
              </CardHeader>
              <CardContent>
                {revenueData.length > 0 ? (
                  <ChartContainer config={{ revenue: { label: "Revenue (€)", color: "hsl(var(--accent))" } }} className="h-[200px] w-full">
                    <BarChart data={revenueData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="month" className="text-xs" />
                      <YAxis className="text-xs" />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                ) : (
                  <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                    No invoiced revenue this quarter
                  </div>
                )}
              </CardContent>
            </Card>
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

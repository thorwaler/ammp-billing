import { useState, useEffect, useCallback } from "react";
import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  BarChart as BarChartIcon,
  LineChart,
  PieChart,
  FileText,
  DownloadCloud,
  RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  LineChart as RechartsLineChart,
  Line,
  AreaChart,
  Area
} from 'recharts';
import { useCurrency } from "@/contexts/CurrencyContext";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  getMWGrowthByMonth, 
  getCustomerGrowthByQuarter, 
  getMWpByCustomer,
  getMonthlyRevenue,
  getProjectedRevenueByMonth,
  MWGrowthData,
  CustomerGrowthData,
  CustomerMWData,
  ProjectedRevenueData,
  ActualRevenueData,
  ReportFilters as AnalyticsFilters
} from "@/services/analytics/dashboardAnalytics";
import { ReportsFilters, ReportFilters } from "@/components/reports/ReportsFilters";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface CombinedRevenueData {
  month: string;
  monthKey: string;
  projected: number;
  actual: number;
}

const Reports = () => {
  const { formatCurrency, convertToDisplayCurrency } = useCurrency();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [mwGrowthData, setMwGrowthData] = useState<MWGrowthData[]>([]);
  const [customerGrowthData, setCustomerGrowthData] = useState<CustomerGrowthData[]>([]);
  const [mwpByCustomer, setMwpByCustomer] = useState<CustomerMWData[]>([]);
  const [projectedRevenueData, setProjectedRevenueData] = useState<ProjectedRevenueData[]>([]);
  const [combinedRevenueData, setCombinedRevenueData] = useState<CombinedRevenueData[]>([]);
  
  // Filter state
  const [filters, setFilters] = useState<ReportFilters>({});
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);

  // Fetch customers for filter dropdown
  const fetchCustomers = useCallback(async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('customers')
      .select('id, name')
      .eq('user_id', user.id)
      .order('name');
    
    setCustomers(data || []);
  }, [user]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const analyticsFilters: AnalyticsFilters = {
        startDate: filters.startDate,
        endDate: filters.endDate,
        customerIds: filters.customerIds,
      };

      const [mwGrowth, customerGrowth, customerMWp, projected, actual] = await Promise.all([
        getMWGrowthByMonth(analyticsFilters),
        getCustomerGrowthByQuarter(analyticsFilters),
        getMWpByCustomer(8, analyticsFilters),
        getProjectedRevenueByMonth(12, analyticsFilters),
        getMonthlyRevenue(analyticsFilters),
      ]);
      
      setMwGrowthData(mwGrowth);
      setCustomerGrowthData(customerGrowth);
      setMwpByCustomer(customerMWp);
      
      // Set projected revenue with currency conversion
      setProjectedRevenueData(projected.map(p => ({
        ...p,
        projected: convertToDisplayCurrency(p.projected)
      })));
      
      // Combine projected and actual for comparison chart
      const combined: CombinedRevenueData[] = projected.map(p => {
        const actualEntry = actual.find(a => a.monthKey === p.monthKey);
        return {
          month: p.month,
          monthKey: p.monthKey,
          projected: convertToDisplayCurrency(p.projected),
          actual: actualEntry ? convertToDisplayCurrency(actualEntry.actual) : 0,
        };
      });
      setCombinedRevenueData(combined);
    } catch (error) {
      console.error('Error fetching report data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [filters, convertToDisplayCurrency]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleFiltersChange = (newFilters: ReportFilters) => {
    setFilters(newFilters);
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border rounded p-2 shadow-lg">
          <p className="text-sm font-medium">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {entry.name.toLowerCase().includes('revenue') 
                ? formatCurrency(entry.value) 
                : entry.name.toLowerCase().includes('mw') 
                  ? `${entry.value} MW` 
                  : entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const renderEmptyState = (message: string) => (
    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
      <p>{message}</p>
    </div>
  );

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center">
              <BarChartIcon className="h-8 w-8 mr-2 text-ammp-blue" />
              Reports
            </h1>
            <p className="text-muted-foreground mt-1">
              Business analytics and performance reporting (real data)
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={fetchData} disabled={isLoading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline">
              <FileText className="mr-2 h-4 w-4" />
              Generate Report
            </Button>
            <Button variant="outline">
              <DownloadCloud className="mr-2 h-4 w-4" />
              Export Data
            </Button>
          </div>
        </div>

        {/* Filters */}
        <ReportsFilters
          customers={customers}
          filters={filters}
          onFiltersChange={handleFiltersChange}
          isLoading={isLoading}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* MW Growth Over Time */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <BarChartIcon className="h-5 w-5 text-ammp-blue" />
                MW Growth Over Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[300px] w-full" />
              ) : mwGrowthData.length > 0 ? (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={mwGrowthData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Area 
                        type="monotone" 
                        dataKey="cumulativeMW" 
                        name="Total MW" 
                        stroke="#0F4C81" 
                        fill="#0F4C81" 
                        fillOpacity={0.3}
                      />
                      <Bar dataKey="mw" name="MW Added" fill="#1A7D7D" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : renderEmptyState("Sync AMMP data to see MW growth. Asset creation dates will be captured on sync.")}
            </CardContent>
          </Card>

          {/* Customer Growth */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <LineChart className="h-5 w-5 text-ammp-blue" />
                Customer Growth
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[300px] w-full" />
              ) : customerGrowthData.length > 0 ? (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsLineChart data={customerGrowthData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="quarter" />
                      <YAxis />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="customers" 
                        name="Total Customers"
                        stroke="#1A7D7D" 
                        activeDot={{ r: 8 }} 
                        strokeWidth={2}
                      />
                    </RechartsLineChart>
                  </ResponsiveContainer>
                </div>
              ) : renderEmptyState("Add customers with join dates to see growth trends.")}
            </CardContent>
          </Card>

          {/* Revenue Forecast */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <PieChart className="h-5 w-5 text-ammp-blue" />
                Revenue Forecast (Next 12 Months)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[300px] w-full" />
              ) : projectedRevenueData.length > 0 ? (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={projectedRevenueData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis tickFormatter={(value) => formatCurrency(value)} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Bar dataKey="projected" name="Projected Revenue" fill="#0F4C81" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : renderEmptyState("Add contracts with billing schedules to see revenue forecast.")}
            </CardContent>
          </Card>

          {/* Actual vs Projected Revenue */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <LineChart className="h-5 w-5 text-ammp-blue" />
                Actual vs Projected Revenue
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[300px] w-full" />
              ) : combinedRevenueData.length > 0 ? (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={combinedRevenueData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis tickFormatter={(value) => formatCurrency(value)} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Bar dataKey="actual" name="Actual Revenue" fill="#1A7D7D" />
                      <Bar dataKey="projected" name="Projected Revenue" fill="#0F4C81" opacity={0.5} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : renderEmptyState("Add contracts to see revenue comparison.")}
            </CardContent>
          </Card>

          {/* MWp by Customer */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <BarChartIcon className="h-5 w-5 text-ammp-blue" />
                MWp by Customer
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[300px] w-full" />
              ) : mwpByCustomer.length > 0 ? (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={mwpByCustomer}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="name" type="category" width={100} />
                      <Tooltip 
                        formatter={(value) => [`${value} MWp`, 'Capacity']}
                      />
                      <Legend />
                      <Bar dataKey="mwp" name="Capacity" fill="#3498DB" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : renderEmptyState("Sync AMMP data to see customer capacity.")}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default Reports;

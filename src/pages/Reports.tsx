import { useState, useEffect } from "react";
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
  MWGrowthData,
  CustomerGrowthData,
  CustomerMWData
} from "@/services/analytics/dashboardAnalytics";

const Reports = () => {
  const { formatCurrency, convertToDisplayCurrency } = useCurrency();
  const [isLoading, setIsLoading] = useState(true);
  const [mwGrowthData, setMwGrowthData] = useState<MWGrowthData[]>([]);
  const [customerGrowthData, setCustomerGrowthData] = useState<CustomerGrowthData[]>([]);
  const [mwpByCustomer, setMwpByCustomer] = useState<CustomerMWData[]>([]);
  const [revenueData, setRevenueData] = useState<{ month: string; revenue: number }[]>([]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [mwGrowth, customerGrowth, customerMWp, revenue] = await Promise.all([
        getMWGrowthByMonth(),
        getCustomerGrowthByQuarter(),
        getMWpByCustomer(8),
        getMonthlyRevenue(),
      ]);
      
      setMwGrowthData(mwGrowth);
      setCustomerGrowthData(customerGrowth);
      setMwpByCustomer(customerMWp);
      setRevenueData(revenue.map(r => ({ 
        month: r.month, 
        revenue: convertToDisplayCurrency(r.revenue) 
      })));
    } catch (error) {
      console.error('Error fetching report data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

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

          {/* Monthly Revenue */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <PieChart className="h-5 w-5 text-ammp-blue" />
                Monthly Revenue
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[300px] w-full" />
              ) : revenueData.length > 0 ? (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={revenueData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Bar dataKey="revenue" name="Revenue" fill="#0F4C81" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : renderEmptyState("Create invoices to see revenue trends.")}
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

import { useState, useEffect, useCallback, useMemo } from "react";
import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  BarChart as BarChartIcon,
  LineChart,
  PieChart,
  FileText,
  DownloadCloud,
  RefreshCw,
  TrendingUp,
  DollarSign
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
  getARRvsNRRByMonth,
  getTotalARRFromInvoices,
  getTotalNRRFromInvoices,
  getRevenueByCustomer,
  getARRByCustomer,
  getTotalContractARR,
  MWGrowthData,
  CustomerGrowthData,
  CustomerMWData,
  CustomerRevenueData,
  ProjectedRevenueData,
  ActualRevenueData,
  ARRvsNRRData,
  CustomerARRData,
  ReportFilters as AnalyticsFilters
} from "@/services/analytics/dashboardAnalytics";
import { ReportsFilters, ReportFilters } from "@/components/reports/ReportsFilters";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import StatCard from "@/components/dashboard/StatCard";
import { exportReportsToExcel } from "@/lib/reportsExport";
import { toast } from "sonner";

interface CombinedRevenueData {
  month: string;
  monthKey: string;
  projected: number;
  actual: number;
  actualARR: number;
}

const Reports = () => {
  const { formatCurrency, convertToDisplayCurrency, currency, exchangeRate } = useCurrency();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [mwGrowthData, setMwGrowthData] = useState<MWGrowthData[]>([]);
  const [customerGrowthData, setCustomerGrowthData] = useState<CustomerGrowthData[]>([]);
  const [mwpByCustomer, setMwpByCustomer] = useState<CustomerMWData[]>([]);
  const [revenueByCustomer, setRevenueByCustomer] = useState<CustomerRevenueData[]>([]);
  const [projectedRevenueData, setProjectedRevenueData] = useState<ProjectedRevenueData[]>([]);
  const [combinedRevenueData, setCombinedRevenueData] = useState<CombinedRevenueData[]>([]);
  const [arrNrrData, setArrNrrData] = useState<ARRvsNRRData[]>([]);
  const [totalARR, setTotalARR] = useState(0);
  const [totalNRR, setTotalNRR] = useState(0);
  const [arrByCustomer, setArrByCustomer] = useState<CustomerARRData[]>([]);
  const [contractARR, setContractARR] = useState<{ eur: number; usd: number }>({ eur: 0, usd: 0 });
  const [showARROnly, setShowARROnly] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  // Filter state
  const [filters, setFilters] = useState<ReportFilters>({});
  const [customers, setCustomers] = useState<{ id: string; name: string; nickname?: string | null; status?: string }[]>([]);

  // Fetch customers for filter dropdown
  const fetchCustomers = useCallback(async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('customers')
      .select('id, name, nickname, status')
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

      // Default date range for ARR/NRR totals if no filter
      // Use 2020 to capture all historical data when "All Time" is selected
      const startDate = filters.startDate || new Date(2020, 0, 1);
      const endDate = filters.endDate || new Date();

      const [mwGrowth, customerGrowth, customerMWp, customerRevenue, projected, actual, arrNrr, arrTotal, nrrTotal, customerARR, totalContractARR] = await Promise.all([
        getMWGrowthByMonth(analyticsFilters),
        getCustomerGrowthByQuarter(analyticsFilters),
        getMWpByCustomer(8, analyticsFilters),
        getRevenueByCustomer(8, analyticsFilters, exchangeRate),
        getProjectedRevenueByMonth(12, analyticsFilters),
        getMonthlyRevenue(analyticsFilters),
        getARRvsNRRByMonth(analyticsFilters, exchangeRate),
        getTotalARRFromInvoices(startDate, endDate, exchangeRate),
        getTotalNRRFromInvoices(startDate, endDate, exchangeRate),
        getARRByCustomer(8, analyticsFilters),
        getTotalContractARR(analyticsFilters),
      ]);
      
      setMwGrowthData(mwGrowth);
      setCustomerGrowthData(customerGrowth);
      setMwpByCustomer(customerMWp);
      setRevenueByCustomer(customerRevenue.map(r => ({
        ...r,
        total: convertToDisplayCurrency(r.total, "EUR"),
        arr: convertToDisplayCurrency(r.arr, "EUR"),
        nrr: convertToDisplayCurrency(r.nrr, "EUR"),
      })));
      setTotalARR(convertToDisplayCurrency(arrTotal, "EUR"));
      setTotalNRR(convertToDisplayCurrency(nrrTotal, "EUR"));
      
      // Set contract-based ARR data
      setArrByCustomer(customerARR.map(c => ({
        ...c,
        arr: convertToDisplayCurrency(c.arr, "EUR"),
      })));
      setContractARR({
        eur: totalContractARR.eurTotal,
        usd: totalContractARR.usdTotal,
      });
      
      // Set ARR vs NRR data with currency conversion
      setArrNrrData(arrNrr.map(d => ({
        ...d,
        arr: convertToDisplayCurrency(d.arr, "EUR"),
        nrr: convertToDisplayCurrency(d.nrr, "EUR"),
      })));
      
      // Set projected revenue with currency conversion
      setProjectedRevenueData(projected.map(p => ({
        ...p,
        projected: convertToDisplayCurrency(p.projected, "EUR")
      })));
      
      // Combine projected and actual for comparison chart
      const combined: CombinedRevenueData[] = projected.map(p => {
        const actualEntry = actual.find(a => a.monthKey === p.monthKey);
        const arrEntry = arrNrr.find(a => a.monthKey === p.monthKey);
        return {
          month: p.month,
          monthKey: p.monthKey,
          projected: convertToDisplayCurrency(p.projected, "EUR"),
          actual: actualEntry ? convertToDisplayCurrency(actualEntry.actual, "EUR") : 0,
          actualARR: arrEntry ? convertToDisplayCurrency(arrEntry.arr, "EUR") : 0,
        };
      });
      setCombinedRevenueData(combined);
    } catch (error) {
      console.error('Error fetching report data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [filters, convertToDisplayCurrency, exchangeRate]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleFiltersChange = (newFilters: ReportFilters) => {
    setFilters(newFilters);
  };

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      // Filter to only active customers for export
      const activeCustomerIds = customers
        .filter(c => c.status === 'active')
        .map(c => c.id);
      
      // Use active customers for export (respecting any existing customer filter)
      const exportCustomerIds = filters.customerIds && filters.customerIds.length > 0
        ? filters.customerIds.filter(id => activeCustomerIds.includes(id))
        : activeCustomerIds;

      const analyticsFilters: AnalyticsFilters = {
        startDate: filters.startDate,
        endDate: filters.endDate,
        customerIds: exportCustomerIds.length > 0 ? exportCustomerIds : undefined,
      };

      // Fetch all customer data (no limit) for export - filtered to active customers
      const [fullCustomerRevenue, fullCustomerARR] = await Promise.all([
        getRevenueByCustomer(undefined, analyticsFilters),
        getARRByCustomer(undefined, analyticsFilters),
      ]);

      // Get the year from filters or current year
      const year = filters.startDate?.getFullYear() || new Date().getFullYear();

      // Build monthly data from combinedRevenueData and arrNrrData
      const monthlyData = combinedRevenueData.map(d => {
        const arrNrrEntry = arrNrrData.find(a => a.monthKey === d.monthKey);
        return {
          month: d.month,
          monthKey: d.monthKey,
          forecast: d.projected,
          actual: d.actual,
          actualARR: arrNrrEntry?.arr || 0,
          actualNRR: arrNrrEntry?.nrr || 0,
        };
      });

      // Build customer data by merging invoice revenue and contract ARR
      const customerData = fullCustomerRevenue.map(c => {
        const contractARREntry = fullCustomerARR.find(a => a.name === c.name);
        return {
          name: c.name,
          totalRevenue: c.total,
          arr: c.arr,
          nrr: c.nrr,
          contractARR: contractARREntry?.arr || 0,
        };
      });

      // Calculate summary data
      const totalForecast = monthlyData.reduce((sum, m) => sum + m.forecast, 0);
      const totalActual = monthlyData.reduce((sum, m) => sum + m.actual, 0);

      exportReportsToExcel({
        year,
        currency: currency,
        monthlyData,
        customerData,
        summaryData: {
          totalForecast,
          totalActual,
          totalARR,
          totalNRR,
          contractARR: contractARRDisplay,
          arrPercentage,
        },
      });

      toast.success('Report exported successfully');
    } catch (error) {
      console.error('Error exporting report:', error);
      toast.error('Failed to export report');
    } finally {
      setIsExporting(false);
    }
  };

  const arrPercentage = totalARR + totalNRR > 0 
    ? Math.round((totalARR / (totalARR + totalNRR)) * 100) 
    : 0;

  // Calculate contract ARR in display currency
  const contractARRDisplay = convertToDisplayCurrency(contractARR.eur, "EUR") + 
    convertToDisplayCurrency(contractARR.usd, "USD");

  // Aggregate monthly MW data into quarters
  const quarterlyMWData = useMemo(() => {
    if (!mwGrowthData.length) return [];
    const quarterMap = new Map<string, { quarter: string; mw: number; cumulativeMW: number }>();
    const monthToQuarter = (month: string) => {
      const parts = month.split(' ');
      const monthName = parts[0];
      const year = parts[1];
      const monthIndex = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(monthName);
      const q = Math.floor(monthIndex / 3) + 1;
      return `Q${q} ${year}`;
    };
    mwGrowthData.forEach(d => {
      const qKey = monthToQuarter(d.month);
      const existing = quarterMap.get(qKey);
      quarterMap.set(qKey, {
        quarter: qKey,
        mw: (existing?.mw || 0) + d.mw,
        cumulativeMW: d.cumulativeMW, // last month in quarter wins
      });
    });
    return Array.from(quarterMap.values());
  }, [mwGrowthData]);

  // Aggregate monthly ARR/NRR data into quarters
  const quarterlyRevenueData = useMemo(() => {
    if (!arrNrrData.length) return [];
    const quarterMap = new Map<string, { quarter: string; arr: number; nrr: number }>();
    const monthToQuarter = (month: string) => {
      const parts = month.split(' ');
      const monthName = parts[0];
      const year = parts[1];
      const monthIndex = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(monthName);
      const q = Math.floor(monthIndex / 3) + 1;
      return `Q${q} ${year}`;
    };
    arrNrrData.forEach(d => {
      const qKey = monthToQuarter(d.month);
      const existing = quarterMap.get(qKey);
      quarterMap.set(qKey, {
        quarter: qKey,
        arr: (existing?.arr || 0) + d.arr,
        nrr: (existing?.nrr || 0) + d.nrr,
      });
    });
    return Array.from(quarterMap.values());
  }, [arrNrrData]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border rounded p-2 shadow-lg">
          <p className="text-sm font-medium">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {entry.name.toLowerCase().includes('revenue') || entry.name.toLowerCase().includes('arr') || entry.name.toLowerCase().includes('nrr')
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
            <Button variant="outline" onClick={handleExportData} disabled={isExporting || isLoading}>
              <DownloadCloud className={`mr-2 h-4 w-4 ${isExporting ? 'animate-pulse' : ''}`} />
              {isExporting ? 'Exporting...' : 'Export Data'}
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

        {/* ARR/NRR Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            title="Contract ARR"
            value={formatCurrency(contractARRDisplay)}
            description="From active contract values"
            icon={TrendingUp}
            className="border-l-4 border-l-purple-500"
          />
          <StatCard
            title="Invoice ARR"
            value={formatCurrency(totalARR)}
            description="Platform fees from invoices"
            icon={TrendingUp}
            className="border-l-4 border-l-ammp-teal"
          />
          <StatCard
            title="Invoice NRR"
            value={formatCurrency(totalNRR)}
            description="Implementation fees from invoices"
            icon={DollarSign}
            className="border-l-4 border-l-orange-500"
          />
          <StatCard
            title="ARR % of Total"
            value={`${arrPercentage}%`}
            description="Recurring revenue ratio"
            icon={PieChart}
            className="border-l-4 border-l-ammp-blue"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ARR vs NRR Stacked Area Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-ammp-teal" />
                ARR vs NRR by Month
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[300px] w-full" />
              ) : arrNrrData.length > 0 ? (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={arrNrrData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis tickFormatter={(value) => formatCurrency(value)} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Area 
                        type="monotone" 
                        dataKey="arr" 
                        name="ARR (Platform Fees)" 
                        stackId="1"
                        stroke="#1A7D7D" 
                        fill="#1A7D7D" 
                        fillOpacity={0.6}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="nrr" 
                        name="NRR (Implementation)" 
                        stackId="1"
                        stroke="#F97316" 
                        fill="#F97316" 
                        fillOpacity={0.6}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : renderEmptyState("Create invoices to see ARR vs NRR breakdown.")}
            </CardContent>
          </Card>

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
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-xl flex items-center gap-2">
                <LineChart className="h-5 w-5 text-ammp-blue" />
                Actual vs Projected Revenue
              </CardTitle>
              <div className="flex items-center space-x-2">
                <Switch
                  id="arr-only"
                  checked={showARROnly}
                  onCheckedChange={setShowARROnly}
                />
                <Label htmlFor="arr-only" className="text-sm text-muted-foreground">
                  ARR Only
                </Label>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[300px] w-full" />
              ) : combinedRevenueData.length > 0 ? (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsLineChart data={combinedRevenueData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis tickFormatter={(value) => formatCurrency(value)} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey={showARROnly ? "actualARR" : "actual"}
                        name={showARROnly ? "Actual ARR" : "Actual Revenue"} 
                        stroke="#1A7D7D" 
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="projected" 
                        name="Projected Revenue" 
                        stroke="#0F4C81" 
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </RechartsLineChart>
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

          {/* Revenue by Customer */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-ammp-teal" />
                Revenue by Customer
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[300px] w-full" />
              ) : revenueByCustomer.length > 0 ? (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={revenueByCustomer}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tickFormatter={(value) => formatCurrency(value)} />
                      <YAxis dataKey="name" type="category" width={120} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Bar dataKey="arr" name="ARR (Platform Fees)" stackId="a" fill="#1A7D7D" />
                      <Bar dataKey="nrr" name="NRR (Implementation)" stackId="a" fill="#F97316" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : renderEmptyState("Create invoices to see revenue by customer.")}
            </CardContent>
          </Card>

          {/* ARR by Customer (Contract Values) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-purple-500" />
                ARR by Customer (Contract Values)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[300px] w-full" />
              ) : arrByCustomer.length > 0 ? (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={arrByCustomer}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tickFormatter={(value) => formatCurrency(value)} />
                      <YAxis dataKey="name" type="category" width={120} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Bar dataKey="arr" name="Contract ARR" fill="#9333EA" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : renderEmptyState("Add contracts to see ARR by customer.")}
            </CardContent>
          </Card>

          {/* MW by Quarter */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <BarChartIcon className="h-5 w-5 text-ammp-blue" />
                MW by Quarter
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[300px] w-full" />
              ) : quarterlyMWData.length > 0 ? (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={quarterlyMWData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="quarter" />
                      <YAxis yAxisId="left" />
                      <YAxis yAxisId="right" orientation="right" />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Bar yAxisId="left" dataKey="mw" name="MW Added" fill="#1A7D7D" />
                      <Line yAxisId="right" type="monotone" dataKey="cumulativeMW" name="Cumulative MW" stroke="#0F4C81" strokeWidth={2} dot={{ r: 4 }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : renderEmptyState("Sync AMMP data to see quarterly MW growth.")}
            </CardContent>
          </Card>

          {/* Revenue by Quarter */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-ammp-teal" />
                Revenue by Quarter
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[300px] w-full" />
              ) : quarterlyRevenueData.length > 0 ? (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={quarterlyRevenueData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="quarter" />
                      <YAxis tickFormatter={(value) => formatCurrency(value)} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Bar dataKey="arr" name="ARR (Platform Fees)" stackId="a" fill="#1A7D7D" />
                      <Bar dataKey="nrr" name="NRR (Implementation)" stackId="a" fill="#F97316" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : renderEmptyState("Create invoices to see quarterly revenue breakdown.")}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default Reports;


import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  BarChart as BarChartIcon,
  LineChart,
  PieChart,
  FileText,
  DownloadCloud
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
  PieChart as RechartsPieChart,
  Pie,
  Cell
} from 'recharts';
import { useCurrency } from "@/contexts/CurrencyContext";

const Reports = () => {
  const { formatCurrency, convertToDisplayCurrency } = useCurrency();
  
  const monthlyData = [
    { name: 'Jan', revenue: convertToDisplayCurrency(12000) },
    { name: 'Feb', revenue: convertToDisplayCurrency(15000) },
    { name: 'Mar', revenue: convertToDisplayCurrency(18000) },
    { name: 'Apr', revenue: convertToDisplayCurrency(16500) },
    { name: 'May', revenue: convertToDisplayCurrency(22000) },
    { name: 'Jun', revenue: convertToDisplayCurrency(28000) },
    { name: 'Jul', revenue: convertToDisplayCurrency(32000) },
  ];
  
  const customerGrowthData = [
    { name: 'Q1', customers: 6 },
    { name: 'Q2', customers: 8 },
    { name: 'Q3', customers: 10 },
    { name: 'Q4', customers: 12 },
  ];
  
  const addOnDistributionData = [
    { name: 'Monitoring', value: 12 },
    { name: 'Analytics', value: 8 },
    { name: 'Reporting', value: 6 },
    { name: 'Maintenance', value: 4 },
  ];
  
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];
  
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border rounded p-2">
          <p className="text-sm">{`${payload[0].name}: ${formatCurrency(payload[0].value)}`}</p>
        </div>
      );
    }
    return null;
  };

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
              Business analytics and performance reporting
            </p>
          </div>
          <div className="flex gap-2">
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
          <Card>
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <BarChartIcon className="h-5 w-5 text-ammp-blue" />
                Monthly Revenue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="revenue" fill="#0F4C81" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <LineChart className="h-5 w-5 text-ammp-blue" />
                Customer Growth
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsLineChart data={customerGrowthData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="customers" 
                      stroke="#1A7D7D" 
                      activeDot={{ r: 8 }} 
                      strokeWidth={2}
                    />
                  </RechartsLineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <PieChart className="h-5 w-5 text-ammp-blue" />
                Add-on Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie
                      data={addOnDistributionData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    >
                      {addOnDistributionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <BarChartIcon className="h-5 w-5 text-ammp-blue" />
                MWp by Customer
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={[
                      { name: 'Solar Universe', mwp: 42.5 },
                      { name: 'GreenPower', mwp: 35.2 },
                      { name: 'Solaris', mwp: 28.7 },
                      { name: 'SunPeak', mwp: 22.3 },
                      { name: 'EcoSun', mwp: 18.9 },
                    ]}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={100} />
                    <Tooltip 
                      formatter={(value) => [`${value} MWp`, 'Capacity']}
                    />
                    <Legend />
                    <Bar dataKey="mwp" fill="#3498DB" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default Reports;

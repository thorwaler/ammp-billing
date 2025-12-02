/**
 * Dashboard Analytics Service
 * Provides real data aggregation for dashboard and reports
 */

import { supabase } from '@/integrations/supabase/client';

export interface DashboardStats {
  totalCustomers: number;
  activeContracts: number;
  totalMWpManaged: number;
  mwAddedThisYear: number;
  customersAddedThisQuarter: number;
  contractsAddedThisQuarter: number;
  mwAddedThisQuarter: number;
}

export interface MWGrowthData {
  month: string;
  mw: number;
  cumulativeMW: number;
}

export interface CustomerGrowthData {
  quarter: string;
  customers: number;
}

export interface CustomerMWData {
  name: string;
  mwp: number;
}

export interface AssetOnboardingData {
  assetName: string;
  totalMW: number;
  onboardingDate: string;
}

/**
 * Helper function to get customer IDs that have at least one active non-POC contract
 */
async function getCustomersWithNonPocContracts(userId: string): Promise<string[]> {
  const { data: contracts } = await supabase
    .from('contracts')
    .select('customer_id')
    .eq('user_id', userId)
    .eq('contract_status', 'active')
    .neq('package', 'poc');
  
  // Return unique customer IDs
  const customerIds = [...new Set(contracts?.map(c => c.customer_id) || [])];
  return customerIds;
}

/**
 * Get dashboard statistics from real data
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const currentQuarter = Math.floor(now.getMonth() / 3);
  const startOfQuarter = new Date(now.getFullYear(), currentQuarter * 3, 1);

  // Get customer IDs with non-POC contracts
  const customerIdsWithContracts = await getCustomersWithNonPocContracts(user.id);

  // Get active customer count (only those with non-POC contracts)
  let totalCustomers = 0;
  if (customerIdsWithContracts.length > 0) {
    const { count } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'active')
      .in('id', customerIdsWithContracts);
    totalCustomers = count || 0;
  }

  // Get active non-POC contracts count
  const { count: activeContracts } = await supabase
    .from('contracts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('contract_status', 'active')
    .neq('package', 'poc');

  // Get total MWp managed (active customers with non-POC contracts only)
  let customers: any[] = [];
  if (customerIdsWithContracts.length > 0) {
    const { data } = await supabase
      .from('customers')
      .select('mwp_managed, join_date, ammp_capabilities')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .in('id', customerIdsWithContracts);
    customers = data || [];
  }

  const totalMWpManaged = customers.reduce((sum, c) => sum + (c.mwp_managed || 0), 0);

  // Calculate MW added this year from AMMP asset creation dates
  let mwAddedThisYear = 0;
  let mwAddedThisQuarter = 0;

  customers.forEach(customer => {
    const capabilities = customer.ammp_capabilities as any;
    if (capabilities?.assetBreakdown) {
      capabilities.assetBreakdown.forEach((asset: any) => {
        if (asset.onboardingDate) {
          const onboardingDate = new Date(asset.onboardingDate);
          if (onboardingDate >= startOfYear) {
            mwAddedThisYear += asset.totalMW || 0;
          }
          if (onboardingDate >= startOfQuarter) {
            mwAddedThisQuarter += asset.totalMW || 0;
          }
        }
      });
    }
  });

  // Count customers added this quarter (only those with non-POC contracts)
  const customersAddedThisQuarter = customers.filter(c => {
    if (!c.join_date) return false;
    return new Date(c.join_date) >= startOfQuarter;
  }).length;

  // Get active non-POC contracts added this quarter
  const { count: contractsAddedThisQuarter } = await supabase
    .from('contracts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('contract_status', 'active')
    .neq('package', 'poc')
    .gte('created_at', startOfQuarter.toISOString());

  return {
    totalCustomers,
    activeContracts: activeContracts || 0,
    totalMWpManaged,
    mwAddedThisYear,
    customersAddedThisQuarter,
    contractsAddedThisQuarter: contractsAddedThisQuarter || 0,
    mwAddedThisQuarter,
  };
}

export interface ReportFilters {
  startDate?: Date;
  endDate?: Date;
  customerIds?: string[];
}

/**
 * Get MW growth over time from asset onboarding dates
 */
export async function getMWGrowthByMonth(filters?: ReportFilters): Promise<MWGrowthData[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Get customer IDs with non-POC contracts
  const customerIdsWithContracts = await getCustomersWithNonPocContracts(user.id);
  if (customerIdsWithContracts.length === 0) return [];

  let query = supabase
    .from('customers')
    .select('id, ammp_capabilities')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .in('id', customerIdsWithContracts);

  // Filter by customer IDs if specified (intersection with non-POC customers)
  if (filters?.customerIds && filters.customerIds.length > 0) {
    const filteredIds = filters.customerIds.filter(id => customerIdsWithContracts.includes(id));
    if (filteredIds.length === 0) return [];
    query = supabase
      .from('customers')
      .select('id, ammp_capabilities')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .in('id', filteredIds);
  }

  const { data: customers } = await query;

  // Extract all asset onboarding data
  const assetData: AssetOnboardingData[] = [];
  
  customers?.forEach(customer => {
    const capabilities = customer.ammp_capabilities as any;
    if (capabilities?.assetBreakdown) {
      capabilities.assetBreakdown.forEach((asset: any) => {
        if (asset.onboardingDate && asset.totalMW) {
          const onboardingDate = new Date(asset.onboardingDate);
          
          // Apply date filters
          if (filters?.startDate && onboardingDate < filters.startDate) return;
          if (filters?.endDate && onboardingDate > filters.endDate) return;
          
          assetData.push({
            assetName: asset.assetName,
            totalMW: asset.totalMW,
            onboardingDate: asset.onboardingDate,
          });
        }
      });
    }
  });

  // Group by month and calculate cumulative MW
  const monthlyMap = new Map<string, number>();
  
  assetData.forEach(asset => {
    const date = new Date(asset.onboardingDate);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + asset.totalMW);
  });

  // Sort by month and calculate cumulative
  const sortedMonths = Array.from(monthlyMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  
  let cumulativeMW = 0;
  const result: MWGrowthData[] = sortedMonths.map(([month, mw]) => {
    cumulativeMW += mw;
    const [year, monthNum] = month.split('-');
    const monthName = new Date(parseInt(year), parseInt(monthNum) - 1).toLocaleDateString('en-US', { 
      month: 'short', 
      year: '2-digit' 
    });
    return {
      month: monthName,
      mw: parseFloat(mw.toFixed(2)),
      cumulativeMW: parseFloat(cumulativeMW.toFixed(2)),
    };
  });

  return result;
}

/**
 * Get customer growth by quarter
 */
export async function getCustomerGrowthByQuarter(filters?: ReportFilters): Promise<CustomerGrowthData[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Get customer IDs with non-POC contracts
  const customerIdsWithContracts = await getCustomersWithNonPocContracts(user.id);
  if (customerIdsWithContracts.length === 0) return [];

  let query = supabase
    .from('customers')
    .select('id, join_date, created_at')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .in('id', customerIdsWithContracts);

  // Filter by customer IDs if specified (intersection with non-POC customers)
  if (filters?.customerIds && filters.customerIds.length > 0) {
    const filteredIds = filters.customerIds.filter(id => customerIdsWithContracts.includes(id));
    if (filteredIds.length === 0) return [];
    query = supabase
      .from('customers')
      .select('id, join_date, created_at')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .in('id', filteredIds);
  }

  const { data: customers } = await query;

  // Group by quarter
  const quarterMap = new Map<string, number>();
  
  customers?.forEach(customer => {
    const dateStr = customer.join_date || customer.created_at;
    if (dateStr) {
      const date = new Date(dateStr);
      
      // Apply date filters
      if (filters?.startDate && date < filters.startDate) return;
      if (filters?.endDate && date > filters.endDate) return;
      
      const quarter = Math.floor(date.getMonth() / 3) + 1;
      const key = `Q${quarter} ${date.getFullYear()}`;
      quarterMap.set(key, (quarterMap.get(key) || 0) + 1);
    }
  });

  // Sort and return
  const result = Array.from(quarterMap.entries())
    .sort((a, b) => {
      const [aQ, aY] = a[0].split(' ');
      const [bQ, bY] = b[0].split(' ');
      if (aY !== bY) return parseInt(aY) - parseInt(bY);
      return parseInt(aQ.slice(1)) - parseInt(bQ.slice(1));
    })
    .map(([quarter, count]) => ({ quarter, customers: count }));

  // Calculate cumulative
  let cumulative = 0;
  return result.map(item => {
    cumulative += item.customers;
    return { quarter: item.quarter, customers: cumulative };
  });
}

/**
 * Get MWp by customer (top customers by capacity)
 */
export async function getMWpByCustomer(limit = 10, filters?: ReportFilters): Promise<CustomerMWData[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Get customer IDs with non-POC contracts
  const customerIdsWithContracts = await getCustomersWithNonPocContracts(user.id);
  if (customerIdsWithContracts.length === 0) return [];

  let customerIds = customerIdsWithContracts;

  // Filter by customer IDs if specified (intersection with non-POC customers)
  if (filters?.customerIds && filters.customerIds.length > 0) {
    customerIds = filters.customerIds.filter(id => customerIdsWithContracts.includes(id));
    if (customerIds.length === 0) return [];
  }

  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, mwp_managed')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .in('id', customerIds)
    .gt('mwp_managed', 0)
    .order('mwp_managed', { ascending: false })
    .limit(limit);

  return customers?.map(c => ({
    name: c.name.length > 15 ? c.name.substring(0, 15) + '...' : c.name,
    mwp: parseFloat((c.mwp_managed || 0).toFixed(2)),
  })) || [];
}

/**
 * Get monthly revenue from invoices
 */
export async function getMonthlyRevenue(filters?: ReportFilters): Promise<{ month: string; revenue: number }[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Default to last 12 months if no filter specified
  const startDate = filters?.startDate || (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d;
  })();
  const endDate = filters?.endDate || new Date();

  let query = supabase
    .from('invoices')
    .select('invoice_date, invoice_amount, customer_id')
    .eq('user_id', user.id)
    .gte('invoice_date', startDate.toISOString())
    .lte('invoice_date', endDate.toISOString());

  // Filter by customer IDs if specified
  if (filters?.customerIds && filters.customerIds.length > 0) {
    query = query.in('customer_id', filters.customerIds);
  }

  const { data: invoices } = await query;

  // Group by month
  const monthlyMap = new Map<string, number>();
  
  invoices?.forEach(invoice => {
    const date = new Date(invoice.invoice_date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + invoice.invoice_amount);
  });

  // Sort and format
  const sortedMonths = Array.from(monthlyMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  
  return sortedMonths.map(([month, revenue]) => {
    const [year, monthNum] = month.split('-');
    const monthName = new Date(parseInt(year), parseInt(monthNum) - 1).toLocaleDateString('en-US', { 
      month: 'short'
    });
    return { month: monthName, revenue: parseFloat(revenue.toFixed(2)) };
  });
}

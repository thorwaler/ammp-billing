/**
 * Dashboard Analytics Service
 * Provides real data aggregation for dashboard and reports
 */

import { supabase } from '@/integrations/supabase/client';
import { calculateInvoice, getFrequencyMultiplier } from '@/lib/invoiceCalculations';
import { addMonths, format } from 'date-fns';

export interface ARRByCurrency {
  eurTotal: number;
  usdTotal: number;
}

export interface DashboardStats {
  totalCustomers: number;
  activeContracts: number;
  totalMWpManaged: number;
  mwAddedThisYear: number;
  customersAddedThisQuarter: number;
  contractsAddedThisQuarter: number;
  mwAddedThisQuarter: number;
  totalARR: ARRByCurrency;
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

export interface ProjectedRevenueData {
  month: string;
  monthKey: string;
  projected: number;
}

export interface ActualRevenueData {
  month: string;
  monthKey: string;
  actual: number;
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

  // Calculate total ARR
  const totalARR = await calculateTotalARR(user.id);

  return {
    totalCustomers,
    activeContracts: activeContracts || 0,
    totalMWpManaged,
    mwAddedThisYear,
    customersAddedThisQuarter,
    contractsAddedThisQuarter: contractsAddedThisQuarter || 0,
    mwAddedThisQuarter,
    totalARR,
  };
}

/**
 * Calculate total ARR (Annual Recurring Revenue) from all active non-POC contracts
 */
async function calculateTotalARR(userId: string): Promise<ARRByCurrency> {
  // Fetch all active non-POC contracts with pricing data
  const { data: contracts } = await supabase
    .from('contracts')
    .select(`
      id,
      customer_id,
      package,
      billing_frequency,
      initial_mw,
      modules,
      addons,
      minimum_annual_value,
      minimum_charge_tiers,
      portfolio_discount_tiers,
      custom_pricing,
      base_monthly_price,
      site_charge_frequency,
      currency
    `)
    .eq('user_id', userId)
    .eq('contract_status', 'active')
    .neq('package', 'poc');

  if (!contracts || contracts.length === 0) return { eurTotal: 0, usdTotal: 0 };

  // Fetch customer AMMP capabilities for accurate MW calculation
  const customerIds = [...new Set(contracts.map(c => c.customer_id))];
  const { data: customers } = await supabase
    .from('customers')
    .select('id, ammp_capabilities, mwp_managed')
    .in('id', customerIds);

  const customerMap = new Map(customers?.map(c => [c.id, c]) || []);

  let eurTotal = 0;
  let usdTotal = 0;

  for (const contract of contracts) {
    const customer = customerMap.get(contract.customer_id);
    if (!customer) continue;

    // Get AMMP capabilities for accurate calculation
    const ammpCapabilities = customer.ammp_capabilities as any;
    const assetBreakdown = ammpCapabilities?.assetBreakdown || [];
    
    // Calculate MW - use AMMP data if available, otherwise initial_mw
    const totalMW = assetBreakdown.length > 0
      ? assetBreakdown.reduce((sum: number, asset: any) => sum + (asset.totalMW || 0), 0)
      : contract.initial_mw || 0;

    let annualValue = 0;

    try {
      // For starter/capped packages, use minimum_annual_value + base_monthly_price * 12
      if (contract.package === 'starter' || contract.package === 'capped') {
        const annualBase = contract.minimum_annual_value || 0;
        const monthlyBase = contract.base_monthly_price || 0;
        annualValue = annualBase + (monthlyBase * 12);
      } else if (totalMW > 0) {
        // For pro/custom/hybrid_tiered, calculate annual value (frequencyMultiplier = 1)
        const result = calculateInvoice({
          packageType: contract.package as any,
          totalMW,
          selectedModules: (contract.modules as string[]) || [],
          selectedAddons: ((contract.addons as any[]) || []).map((a: any) => ({
            id: a.id || a.addonId,
            quantity: a.quantity || 1,
            complexity: a.complexity,
            customPrice: a.customPrice,
            customTiers: a.customTiers,
          })),
          frequencyMultiplier: 1, // Annual calculation
          customPricing: contract.custom_pricing as any,
          portfolioDiscountTiers: (contract.portfolio_discount_tiers as any[]) || [],
          minimumChargeTiers: (contract.minimum_charge_tiers as any[]) || [],
          minimumAnnualValue: contract.minimum_annual_value || 0,
          ammpCapabilities: ammpCapabilities || undefined,
          siteChargeFrequency: contract.site_charge_frequency as any || 'annual',
          baseMonthlyPrice: contract.base_monthly_price || 0,
        });
        annualValue = result.totalPrice;
      }

      // Add to appropriate currency bucket
      if (contract.currency === 'USD') {
        usdTotal += annualValue;
      } else {
        eurTotal += annualValue; // Default to EUR
      }
    } catch (error) {
      console.error('Error calculating ARR for contract:', contract.id, error);
    }
  }

  return { eurTotal, usdTotal };
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

export interface ARRvsNRRData {
  month: string;
  monthKey: string;
  arr: number;
  nrr: number;
  total: number;
}

/**
 * Get monthly revenue from invoices with month keys for alignment
 */
export async function getMonthlyRevenue(filters?: ReportFilters): Promise<ActualRevenueData[]> {
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
  
  return sortedMonths.map(([monthKey, revenue]) => {
    const [year, monthNum] = monthKey.split('-');
    const monthName = new Date(parseInt(year), parseInt(monthNum) - 1).toLocaleDateString('en-US', { 
      month: 'short',
      year: '2-digit'
    });
    return { month: monthName, monthKey, actual: parseFloat(revenue.toFixed(2)) };
  });
}

/**
 * Get ARR vs NRR breakdown by month from invoices
 */
export async function getARRvsNRRByMonth(filters?: ReportFilters): Promise<ARRvsNRRData[]> {
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
    .select('invoice_date, invoice_amount, arr_amount, nrr_amount, customer_id')
    .eq('user_id', user.id)
    .gte('invoice_date', startDate.toISOString())
    .lte('invoice_date', endDate.toISOString());

  // Filter by customer IDs if specified
  if (filters?.customerIds && filters.customerIds.length > 0) {
    query = query.in('customer_id', filters.customerIds);
  }

  const { data: invoices } = await query;

  // Group by month
  const monthlyMap = new Map<string, { arr: number; nrr: number; total: number }>();
  
  invoices?.forEach((invoice: any) => {
    const date = new Date(invoice.invoice_date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const existing = monthlyMap.get(monthKey) || { arr: 0, nrr: 0, total: 0 };
    monthlyMap.set(monthKey, {
      arr: existing.arr + (invoice.arr_amount || 0),
      nrr: existing.nrr + (invoice.nrr_amount || 0),
      total: existing.total + invoice.invoice_amount,
    });
  });

  // Sort and format
  const sortedMonths = Array.from(monthlyMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  
  return sortedMonths.map(([monthKey, data]) => {
    const [year, monthNum] = monthKey.split('-');
    const monthName = new Date(parseInt(year), parseInt(monthNum) - 1).toLocaleDateString('en-US', { 
      month: 'short',
      year: '2-digit'
    });
    return {
      month: monthName,
      monthKey,
      arr: parseFloat(data.arr.toFixed(2)),
      nrr: parseFloat(data.nrr.toFixed(2)),
      total: parseFloat(data.total.toFixed(2)),
    };
  });
}

/**
 * Get total ARR from invoices in date range
 */
export async function getTotalARRFromInvoices(startDate: Date, endDate: Date): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const { data: invoices } = await supabase
    .from('invoices')
    .select('arr_amount')
    .eq('user_id', user.id)
    .gte('invoice_date', startDate.toISOString())
    .lte('invoice_date', endDate.toISOString());

  return invoices?.reduce((sum, inv: any) => sum + (inv.arr_amount || 0), 0) || 0;
}

/**
 * Get total NRR from invoices in date range
 */
export async function getTotalNRRFromInvoices(startDate: Date, endDate: Date): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const { data: invoices } = await supabase
    .from('invoices')
    .select('nrr_amount')
    .eq('user_id', user.id)
    .gte('invoice_date', startDate.toISOString())
    .lte('invoice_date', endDate.toISOString());

  return invoices?.reduce((sum, inv: any) => sum + (inv.nrr_amount || 0), 0) || 0;
}

/**
 * Get projected revenue by month based on contract billing cycles
 */
export async function getProjectedRevenueByMonth(
  monthsAhead: number = 12,
  filters?: ReportFilters
): Promise<ProjectedRevenueData[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Get customer IDs with non-POC contracts if filtering by customer
  const customerIdsWithContracts = await getCustomersWithNonPocContracts(user.id);
  if (customerIdsWithContracts.length === 0) return [];

  // Fetch active non-POC contracts with all pricing data
  let query = supabase
    .from('contracts')
    .select(`
      id,
      customer_id,
      package,
      billing_frequency,
      next_invoice_date,
      initial_mw,
      modules,
      addons,
      minimum_annual_value,
      minimum_charge_tiers,
      portfolio_discount_tiers,
      custom_pricing,
      base_monthly_price,
      site_charge_frequency,
      currency
    `)
    .eq('user_id', user.id)
    .eq('contract_status', 'active')
    .neq('package', 'poc');

  // Filter by customer IDs if specified
  if (filters?.customerIds && filters.customerIds.length > 0) {
    const filteredIds = filters.customerIds.filter(id => customerIdsWithContracts.includes(id));
    if (filteredIds.length === 0) return [];
    query = query.in('customer_id', filteredIds);
  }

  const { data: contracts } = await query;
  if (!contracts || contracts.length === 0) return [];

  // Fetch customer AMMP capabilities for accurate MW calculation
  const customerIds = [...new Set(contracts.map(c => c.customer_id))];
  const { data: customers } = await supabase
    .from('customers')
    .select('id, ammp_capabilities, mwp_managed')
    .in('id', customerIds);

  const customerMap = new Map(customers?.map(c => [c.id, c]) || []);

  // Calculate projected invoices for each contract
  const now = new Date();
  const endOfForecast = addMonths(now, monthsAhead);
  const monthlyProjected = new Map<string, number>();

  // Billing frequency to months mapping
  const frequencyToMonths: Record<string, number> = {
    monthly: 1,
    quarterly: 3,
    biannual: 6,
    annual: 12,
  };

  for (const contract of contracts) {
    const customer = customerMap.get(contract.customer_id);
    if (!customer) continue;

    // Get AMMP capabilities for accurate calculation
    const ammpCapabilities = customer.ammp_capabilities as any;
    const assetBreakdown = ammpCapabilities?.assetBreakdown || [];
    
    // Calculate MW - use AMMP data if available, otherwise initial_mw
    const totalMW = assetBreakdown.length > 0
      ? assetBreakdown.reduce((sum: number, asset: any) => sum + (asset.totalMW || 0), 0)
      : contract.initial_mw || 0;

    if (totalMW === 0) continue;

    // Determine billing frequency and interval
    const billingFrequency = contract.billing_frequency || 'annual';
    const monthsPerInvoice = frequencyToMonths[billingFrequency] || 12;
    const frequencyMultiplier = getFrequencyMultiplier(billingFrequency);

    // Calculate per-invoice amount using the invoice calculation logic
    let perInvoiceAmount = 0;

    try {
      // For starter/capped packages, use minimum_annual_value * frequency multiplier
      if (contract.package === 'starter' || contract.package === 'capped') {
        const basePrice = contract.minimum_annual_value || 0;
        const monthlyBase = contract.base_monthly_price || 0;
        perInvoiceAmount = (basePrice * frequencyMultiplier) + (monthlyBase * monthsPerInvoice);
      } else {
        // For pro/custom/hybrid_tiered, use full calculation
        const result = calculateInvoice({
          packageType: contract.package as any,
          totalMW,
          selectedModules: (contract.modules as string[]) || [],
          selectedAddons: ((contract.addons as any[]) || []).map((a: any) => ({
            id: a.id || a.addonId,
            quantity: a.quantity || 1,
            complexity: a.complexity,
            customPrice: a.customPrice,
            customTiers: a.customTiers,
          })),
          frequencyMultiplier,
          customPricing: contract.custom_pricing as any,
          portfolioDiscountTiers: (contract.portfolio_discount_tiers as any[]) || [],
          minimumChargeTiers: (contract.minimum_charge_tiers as any[]) || [],
          minimumAnnualValue: contract.minimum_annual_value || 0,
          ammpCapabilities: ammpCapabilities || undefined,
          siteChargeFrequency: contract.site_charge_frequency as any || 'annual',
          baseMonthlyPrice: contract.base_monthly_price || 0,
        });
        perInvoiceAmount = result.totalPrice;
      }
    } catch (error) {
      console.error('Error calculating invoice for contract:', contract.id, error);
      continue;
    }

    if (perInvoiceAmount <= 0) continue;

    // Project invoice dates forward from next_invoice_date
    let invoiceDate = contract.next_invoice_date 
      ? new Date(contract.next_invoice_date)
      : now;

    // If next_invoice_date is in the past, move it forward to current period
    while (invoiceDate < now) {
      invoiceDate = addMonths(invoiceDate, monthsPerInvoice);
    }

    // Generate projected invoices for the forecast period
    while (invoiceDate <= endOfForecast) {
      const monthKey = format(invoiceDate, 'yyyy-MM');
      monthlyProjected.set(monthKey, (monthlyProjected.get(monthKey) || 0) + perInvoiceAmount);
      invoiceDate = addMonths(invoiceDate, monthsPerInvoice);
    }
  }

  // Generate all months in the forecast period (even if 0)
  const result: ProjectedRevenueData[] = [];
  let currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  
  for (let i = 0; i < monthsAhead; i++) {
    const monthKey = format(currentMonth, 'yyyy-MM');
    const monthLabel = format(currentMonth, 'MMM yy');
    const projected = monthlyProjected.get(monthKey) || 0;
    
    result.push({
      month: monthLabel,
      monthKey,
      projected: parseFloat(projected.toFixed(2)),
    });
    
    currentMonth = addMonths(currentMonth, 1);
  }

  return result;
}

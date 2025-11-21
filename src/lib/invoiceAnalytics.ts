import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

export interface MWGrowthData {
  month: string;
  totalMW: number;
  mwAdded: number;
  customersInvoiced: number;
}

/**
 * Get MW growth data over time, grouped by month
 */
export async function getMWGrowthOverTime(
  startDate: Date,
  endDate: Date
): Promise<MWGrowthData[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('invoice_date, mw_change, total_mw, customer_id')
    .gte('invoice_date', startDate.toISOString())
    .lte('invoice_date', endDate.toISOString())
    .order('invoice_date');

  if (error) throw error;

  // Group by month and aggregate
  const monthlyData = new Map<string, MWGrowthData>();
  
  data?.forEach(invoice => {
    const monthKey = format(new Date(invoice.invoice_date), 'MMM yyyy');
    const existing = monthlyData.get(monthKey) || {
      month: monthKey,
      totalMW: 0,
      mwAdded: 0,
      customersInvoiced: 0
    };
    
    existing.totalMW += invoice.total_mw;
    existing.mwAdded += invoice.mw_change;
    existing.customersInvoiced += 1;
    
    monthlyData.set(monthKey, existing);
  });

  return Array.from(monthlyData.values());
}

/**
 * Get total MW added between two dates
 */
export async function getTotalMWAdded(
  startDate: Date,
  endDate: Date
): Promise<number> {
  const { data, error } = await supabase
    .from('invoices')
    .select('mw_change')
    .gte('invoice_date', startDate.toISOString())
    .lte('invoice_date', endDate.toISOString());

  if (error) throw error;

  return data?.reduce((sum, inv) => sum + (inv.mw_change || 0), 0) || 0;
}

/**
 * Get total revenue between two dates
 */
export async function getTotalRevenue(
  startDate: Date,
  endDate: Date
): Promise<number> {
  const { data, error } = await supabase
    .from('invoices')
    .select('invoice_amount')
    .gte('invoice_date', startDate.toISOString())
    .lte('invoice_date', endDate.toISOString());

  if (error) throw error;

  return data?.reduce((sum, inv) => sum + (inv.invoice_amount || 0), 0) || 0;
}

/**
 * Get number of invoices between two dates
 */
export async function getInvoiceCount(
  startDate: Date,
  endDate: Date
): Promise<number> {
  const { count, error } = await supabase
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .gte('invoice_date', startDate.toISOString())
    .lte('invoice_date', endDate.toISOString());

  if (error) throw error;

  return count || 0;
}

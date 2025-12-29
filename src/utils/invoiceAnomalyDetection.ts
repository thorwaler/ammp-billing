import { supabase } from "@/integrations/supabase/client";

export interface InvoiceAlert {
  alert_type: 'invoice_increase' | 'mw_decrease' | 'site_decrease' | 'asset_disappeared' | 'asset_reappeared';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  metadata: Record<string, unknown>;
}

interface InvoiceData {
  customerId: string;
  contractId?: string;
  invoiceAmount: number;
  currency: string;
  currentMW: number;
  currentSiteCount: number;
}

interface SyncHistoryEntry {
  synced_at: string;
  total_mw: number;
  total_sites: number;
  asset_breakdown: unknown;
}

// Thresholds for anomaly detection
const THRESHOLDS = {
  INVOICE_INCREASE_WARNING: 0.30,  // 30% increase
  INVOICE_INCREASE_CRITICAL: 0.50, // 50% increase
  ASSET_MANIPULATION_WINDOW_DAYS: 30, // Days before/after invoice to check for manipulation
};

/**
 * Check if current invoice amount is significantly higher than historical average
 */
export async function checkInvoiceAmountIncrease(
  customerId: string,
  currentAmount: number,
  currency: string
): Promise<InvoiceAlert | null> {
  try {
    // Get last 4 invoices for this customer
    const { data: previousInvoices, error } = await supabase
      .from('invoices')
      .select('invoice_amount, invoice_amount_eur, currency')
      .eq('customer_id', customerId)
      .order('invoice_date', { ascending: false })
      .limit(4);

    if (error || !previousInvoices || previousInvoices.length < 2) {
      return null; // Not enough history to compare
    }

    // Calculate average of previous invoices (use EUR for comparison)
    const amounts = previousInvoices.map(inv => 
      inv.invoice_amount_eur || inv.invoice_amount
    );
    const averageAmount = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;

    if (averageAmount === 0) return null;

    const increasePercentage = (currentAmount - averageAmount) / averageAmount;

    if (increasePercentage >= THRESHOLDS.INVOICE_INCREASE_CRITICAL) {
      return {
        alert_type: 'invoice_increase',
        severity: 'critical',
        title: 'Significant Invoice Amount Spike',
        description: `Invoice amount (${currency} ${currentAmount.toLocaleString()}) is ${Math.round(increasePercentage * 100)}% higher than the average of the last ${previousInvoices.length} invoices (${currency} ${averageAmount.toLocaleString()}).`,
        metadata: {
          current_amount: currentAmount,
          average_amount: averageAmount,
          increase_percentage: increasePercentage,
          previous_invoice_count: previousInvoices.length,
        },
      };
    } else if (increasePercentage >= THRESHOLDS.INVOICE_INCREASE_WARNING) {
      return {
        alert_type: 'invoice_increase',
        severity: 'warning',
        title: 'Unusual Invoice Amount Increase',
        description: `Invoice amount (${currency} ${currentAmount.toLocaleString()}) is ${Math.round(increasePercentage * 100)}% higher than the average of the last ${previousInvoices.length} invoices (${currency} ${averageAmount.toLocaleString()}).`,
        metadata: {
          current_amount: currentAmount,
          average_amount: averageAmount,
          increase_percentage: increasePercentage,
          previous_invoice_count: previousInvoices.length,
        },
      };
    }

    return null;
  } catch (err) {
    console.error('Error checking invoice amount increase:', err);
    return null;
  }
}

/**
 * Check if MW has decreased since last invoice
 */
export async function checkMWDecrease(
  contractId: string,
  currentMW: number
): Promise<InvoiceAlert | null> {
  try {
    // Get the last invoice for this contract
    const { data: lastInvoice, error } = await supabase
      .from('invoices')
      .select('total_mw, mw_managed, invoice_date')
      .eq('contract_id', contractId)
      .order('invoice_date', { ascending: false })
      .limit(1)
      .single();

    if (error || !lastInvoice) {
      return null; // No previous invoice to compare
    }

    const previousMW = lastInvoice.total_mw || lastInvoice.mw_managed || 0;
    
    if (currentMW < previousMW) {
      const decrease = previousMW - currentMW;
      const decreasePercentage = (decrease / previousMW) * 100;
      
      return {
        alert_type: 'mw_decrease',
        severity: 'warning',
        title: 'MW Capacity Decreased',
        description: `MW capacity has decreased from ${previousMW.toFixed(2)} MW to ${currentMW.toFixed(2)} MW (${decreasePercentage.toFixed(1)}% reduction) since the last invoice on ${new Date(lastInvoice.invoice_date).toLocaleDateString()}.`,
        metadata: {
          previous_mw: previousMW,
          current_mw: currentMW,
          decrease: decrease,
          decrease_percentage: decreasePercentage,
          last_invoice_date: lastInvoice.invoice_date,
        },
      };
    }

    return null;
  } catch (err) {
    console.error('Error checking MW decrease:', err);
    return null;
  }
}

/**
 * Check if site count has decreased since last sync
 */
export async function checkSiteCountDecrease(
  customerId: string,
  currentSiteCount: number
): Promise<InvoiceAlert | null> {
  try {
    // Get the last two sync history entries
    const { data: syncHistory, error } = await supabase
      .from('ammp_sync_history')
      .select('total_sites, synced_at')
      .eq('customer_id', customerId)
      .order('synced_at', { ascending: false })
      .limit(2);

    if (error || !syncHistory || syncHistory.length < 2) {
      return null; // Not enough sync history
    }

    const previousSync = syncHistory[1];
    const previousSiteCount = previousSync.total_sites || 0;

    if (currentSiteCount < previousSiteCount) {
      const decrease = previousSiteCount - currentSiteCount;
      
      return {
        alert_type: 'site_decrease',
        severity: 'warning',
        title: 'Site Count Decreased',
        description: `Site count has decreased from ${previousSiteCount} to ${currentSiteCount} (${decrease} sites removed) since the sync on ${new Date(previousSync.synced_at).toLocaleDateString()}.`,
        metadata: {
          previous_site_count: previousSiteCount,
          current_site_count: currentSiteCount,
          decrease: decrease,
          previous_sync_date: previousSync.synced_at,
        },
      };
    }

    return null;
  } catch (err) {
    console.error('Error checking site count decrease:', err);
    return null;
  }
}

/**
 * Detect potential asset manipulation (assets disappearing before invoice, reappearing after)
 */
export async function detectAssetManipulation(
  contractId: string,
  customerId: string,
  invoiceDate: Date
): Promise<InvoiceAlert[]> {
  const alerts: InvoiceAlert[] = [];
  
  try {
    // Get sync history around the invoice date
    const windowStart = new Date(invoiceDate);
    windowStart.setDate(windowStart.getDate() - THRESHOLDS.ASSET_MANIPULATION_WINDOW_DAYS);
    
    const windowEnd = new Date(invoiceDate);
    windowEnd.setDate(windowEnd.getDate() + THRESHOLDS.ASSET_MANIPULATION_WINDOW_DAYS);

    const { data: syncHistory, error } = await supabase
      .from('ammp_sync_history')
      .select('synced_at, asset_breakdown, total_sites, total_mw')
      .eq('customer_id', customerId)
      .gte('synced_at', windowStart.toISOString())
      .lte('synced_at', windowEnd.toISOString())
      .order('synced_at', { ascending: true });

    if (error || !syncHistory || syncHistory.length < 2) {
      return alerts; // Not enough data
    }

    // Analyze asset changes around invoice date
    const syncsBefore = syncHistory.filter(s => new Date(s.synced_at) < invoiceDate);
    const syncsAfter = syncHistory.filter(s => new Date(s.synced_at) >= invoiceDate);

    if (syncsBefore.length === 0 || syncsAfter.length === 0) {
      return alerts;
    }

    const lastSyncBefore = syncsBefore[syncsBefore.length - 1];
    const firstSyncAfter = syncsAfter[0];

    // Check for significant MW drop before invoice
    if (lastSyncBefore.total_mw && syncsBefore.length > 1) {
      const earlierSync = syncsBefore[0];
      if (earlierSync.total_mw && lastSyncBefore.total_mw < earlierSync.total_mw * 0.9) {
        alerts.push({
          alert_type: 'asset_disappeared',
          severity: 'critical',
          title: 'Assets Removed Before Invoice Period',
          description: `MW capacity dropped from ${earlierSync.total_mw.toFixed(2)} MW to ${lastSyncBefore.total_mw.toFixed(2)} MW in the ${THRESHOLDS.ASSET_MANIPULATION_WINDOW_DAYS} days before the invoice date. This could indicate intentional manipulation to reduce invoice amount.`,
          metadata: {
            mw_before: earlierSync.total_mw,
            mw_at_invoice: lastSyncBefore.total_mw,
            drop_percentage: ((earlierSync.total_mw - lastSyncBefore.total_mw) / earlierSync.total_mw) * 100,
            window_days: THRESHOLDS.ASSET_MANIPULATION_WINDOW_DAYS,
          },
        });
      }
    }

    // Check for MW increase after invoice (assets returning)
    if (firstSyncAfter.total_mw && lastSyncBefore.total_mw && 
        firstSyncAfter.total_mw > lastSyncBefore.total_mw * 1.1) {
      alerts.push({
        alert_type: 'asset_reappeared',
        severity: 'critical',
        title: 'Assets Returned After Invoice Period',
        description: `MW capacity increased from ${lastSyncBefore.total_mw.toFixed(2)} MW to ${firstSyncAfter.total_mw.toFixed(2)} MW shortly after the invoice date. Combined with a prior decrease, this may indicate invoice manipulation.`,
        metadata: {
          mw_at_invoice: lastSyncBefore.total_mw,
          mw_after: firstSyncAfter.total_mw,
          increase_percentage: ((firstSyncAfter.total_mw - lastSyncBefore.total_mw) / lastSyncBefore.total_mw) * 100,
          window_days: THRESHOLDS.ASSET_MANIPULATION_WINDOW_DAYS,
        },
      });
    }

    return alerts;
  } catch (err) {
    console.error('Error detecting asset manipulation:', err);
    return alerts;
  }
}

/**
 * Run all anomaly checks and return combined alerts
 */
export async function runAllAnomalyChecks(invoiceData: InvoiceData): Promise<InvoiceAlert[]> {
  const alerts: InvoiceAlert[] = [];

  // Run all checks in parallel
  const [
    invoiceIncreaseAlert,
    mwDecreaseAlert,
    siteDecreaseAlert,
    manipulationAlerts,
  ] = await Promise.all([
    checkInvoiceAmountIncrease(invoiceData.customerId, invoiceData.invoiceAmount, invoiceData.currency),
    invoiceData.contractId 
      ? checkMWDecrease(invoiceData.contractId, invoiceData.currentMW)
      : Promise.resolve(null),
    checkSiteCountDecrease(invoiceData.customerId, invoiceData.currentSiteCount),
    invoiceData.contractId 
      ? detectAssetManipulation(invoiceData.contractId, invoiceData.customerId, new Date())
      : Promise.resolve([]),
  ]);

  if (invoiceIncreaseAlert) alerts.push(invoiceIncreaseAlert);
  if (mwDecreaseAlert) alerts.push(mwDecreaseAlert);
  if (siteDecreaseAlert) alerts.push(siteDecreaseAlert);
  alerts.push(...manipulationAlerts);

  return alerts;
}

/**
 * Save alerts to database
 */
export async function saveAlerts(
  alerts: InvoiceAlert[],
  userId: string,
  customerId: string,
  contractId?: string,
  invoiceId?: string
): Promise<void> {
  if (alerts.length === 0) return;

  const alertRecords = alerts.map(alert => ({
    user_id: userId,
    customer_id: customerId,
    contract_id: contractId || null,
    invoice_id: invoiceId || null,
    alert_type: alert.alert_type,
    severity: alert.severity,
    title: alert.title,
    description: alert.description,
    metadata: alert.metadata as unknown as Record<string, never>,
  }));

  const { error } = await supabase
    .from('invoice_alerts')
    .insert(alertRecords);

  if (error) {
    console.error('Error saving alerts:', error);
  }
}

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

export interface AlertSettings {
  invoice_increase_warning: number;
  invoice_increase_critical: number;
  invoice_increase_enabled: boolean;
  mw_decrease_enabled: boolean;
  mw_decrease_threshold: number;
  site_decrease_enabled: boolean;
  site_decrease_threshold: number;
  asset_manipulation_enabled: boolean;
  asset_manipulation_window_days: number;
  asset_manipulation_threshold: number;
}

const DEFAULT_SETTINGS: AlertSettings = {
  invoice_increase_warning: 0.30,
  invoice_increase_critical: 0.50,
  invoice_increase_enabled: true,
  mw_decrease_enabled: true,
  mw_decrease_threshold: 0,
  site_decrease_enabled: true,
  site_decrease_threshold: 0,
  asset_manipulation_enabled: true,
  asset_manipulation_window_days: 30,
  asset_manipulation_threshold: 0.05,
};

/**
 * Fetch alert settings from database
 */
async function getAlertSettings(): Promise<AlertSettings> {
  try {
    const { data, error } = await supabase
      .from('alert_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return DEFAULT_SETTINGS;
    }

    return {
      invoice_increase_warning: Number(data.invoice_increase_warning),
      invoice_increase_critical: Number(data.invoice_increase_critical),
      invoice_increase_enabled: data.invoice_increase_enabled,
      mw_decrease_enabled: data.mw_decrease_enabled,
      mw_decrease_threshold: Number(data.mw_decrease_threshold),
      site_decrease_enabled: data.site_decrease_enabled,
      site_decrease_threshold: data.site_decrease_threshold,
      asset_manipulation_enabled: data.asset_manipulation_enabled,
      asset_manipulation_window_days: data.asset_manipulation_window_days,
      asset_manipulation_threshold: Number(data.asset_manipulation_threshold),
    };
  } catch (err) {
    console.error('Error fetching alert settings:', err);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Check if current invoice amount is significantly higher than historical average
 */
export async function checkInvoiceAmountIncrease(
  customerId: string,
  currentAmount: number,
  currency: string,
  settings: AlertSettings
): Promise<InvoiceAlert | null> {
  if (!settings.invoice_increase_enabled) return null;

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

    if (increasePercentage >= settings.invoice_increase_critical) {
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
    } else if (increasePercentage >= settings.invoice_increase_warning) {
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
  currentMW: number,
  settings: AlertSettings
): Promise<InvoiceAlert | null> {
  if (!settings.mw_decrease_enabled) return null;

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
      
      // Check against threshold
      if (settings.mw_decrease_threshold > 0 && decreasePercentage < settings.mw_decrease_threshold * 100) {
        return null;
      }
      
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
  currentSiteCount: number,
  settings: AlertSettings
): Promise<InvoiceAlert | null> {
  if (!settings.site_decrease_enabled) return null;

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
      
      // Check against threshold
      if (settings.site_decrease_threshold > 0 && decrease < settings.site_decrease_threshold) {
        return null;
      }
      
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
  invoiceDate: Date,
  settings: AlertSettings
): Promise<InvoiceAlert[]> {
  if (!settings.asset_manipulation_enabled) return [];

  const alerts: InvoiceAlert[] = [];
  
  try {
    // Get sync history around the invoice date using configured window
    const windowStart = new Date(invoiceDate);
    windowStart.setDate(windowStart.getDate() - settings.asset_manipulation_window_days);
    
    const windowEnd = new Date(invoiceDate);
    windowEnd.setDate(windowEnd.getDate() + settings.asset_manipulation_window_days);

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
    const threshold = 1 - settings.asset_manipulation_threshold;

    // Check for significant MW drop before invoice
    if (lastSyncBefore.total_mw && syncsBefore.length > 1) {
      const earlierSync = syncsBefore[0];
      if (earlierSync.total_mw && lastSyncBefore.total_mw < earlierSync.total_mw * threshold) {
        alerts.push({
          alert_type: 'asset_disappeared',
          severity: 'critical',
          title: 'Assets Removed Before Invoice Period',
          description: `MW capacity dropped from ${earlierSync.total_mw.toFixed(2)} MW to ${lastSyncBefore.total_mw.toFixed(2)} MW in the ${settings.asset_manipulation_window_days} days before the invoice date. This could indicate intentional manipulation to reduce invoice amount.`,
          metadata: {
            mw_before: earlierSync.total_mw,
            mw_at_invoice: lastSyncBefore.total_mw,
            drop_percentage: ((earlierSync.total_mw - lastSyncBefore.total_mw) / earlierSync.total_mw) * 100,
            window_days: settings.asset_manipulation_window_days,
          },
        });
      }
    }

    // Check for MW increase after invoice (assets returning)
    const increaseThreshold = 1 + settings.asset_manipulation_threshold;
    if (firstSyncAfter.total_mw && lastSyncBefore.total_mw && 
        firstSyncAfter.total_mw > lastSyncBefore.total_mw * increaseThreshold) {
      alerts.push({
        alert_type: 'asset_reappeared',
        severity: 'critical',
        title: 'Assets Returned After Invoice Period',
        description: `MW capacity increased from ${lastSyncBefore.total_mw.toFixed(2)} MW to ${firstSyncAfter.total_mw.toFixed(2)} MW shortly after the invoice date. Combined with a prior decrease, this may indicate invoice manipulation.`,
        metadata: {
          mw_at_invoice: lastSyncBefore.total_mw,
          mw_after: firstSyncAfter.total_mw,
          increase_percentage: ((firstSyncAfter.total_mw - lastSyncBefore.total_mw) / lastSyncBefore.total_mw) * 100,
          window_days: settings.asset_manipulation_window_days,
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
  
  // Fetch settings from database
  const settings = await getAlertSettings();

  // Run all checks in parallel
  const [
    invoiceIncreaseAlert,
    mwDecreaseAlert,
    siteDecreaseAlert,
    manipulationAlerts,
  ] = await Promise.all([
    checkInvoiceAmountIncrease(invoiceData.customerId, invoiceData.invoiceAmount, invoiceData.currency, settings),
    invoiceData.contractId 
      ? checkMWDecrease(invoiceData.contractId, invoiceData.currentMW, settings)
      : Promise.resolve(null),
    checkSiteCountDecrease(invoiceData.customerId, invoiceData.currentSiteCount, settings),
    invoiceData.contractId 
      ? detectAssetManipulation(invoiceData.contractId, invoiceData.customerId, new Date(), settings)
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

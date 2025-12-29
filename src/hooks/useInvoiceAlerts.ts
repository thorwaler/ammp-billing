import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface InvoiceAlertRecord {
  id: string;
  user_id: string;
  invoice_id: string | null;
  contract_id: string | null;
  customer_id: string | null;
  alert_type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  metadata: Record<string, unknown>;
  is_acknowledged: boolean;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  acknowledgment_note: string | null;
  created_at: string;
  // Joined data
  customer?: { name: string; nickname: string | null } | null;
  contract?: { company_name: string; contract_name: string | null } | null;
  invoice?: { invoice_date: string; invoice_amount: number } | null;
}

export function useInvoiceAlerts() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<InvoiceAlertRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAlerts = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('invoice_alerts')
        .select(`
          *,
          customer:customers(name, nickname),
          contract:contracts(company_name, contract_name),
          invoice:invoices(invoice_date, invoice_amount)
        `)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      setAlerts(data as InvoiceAlertRecord[]);
      setError(null);
    } catch (err) {
      console.error('Error fetching alerts:', err);
      setError('Failed to fetch alerts');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchAlerts();

    // Subscribe to real-time changes
    const channel = supabase
      .channel('invoice_alerts_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'invoice_alerts' },
        () => {
          fetchAlerts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAlerts]);

  const acknowledgeAlert = useCallback(async (alertId: string, note?: string) => {
    if (!user) return;

    const { error: updateError } = await supabase
      .from('invoice_alerts')
      .update({
        is_acknowledged: true,
        acknowledged_by: user.id,
        acknowledged_at: new Date().toISOString(),
        acknowledgment_note: note || null,
      })
      .eq('id', alertId);

    if (updateError) {
      console.error('Error acknowledging alert:', updateError);
      throw updateError;
    }

    // Optimistically update local state
    setAlerts(prev => prev.map(a => 
      a.id === alertId 
        ? { 
            ...a, 
            is_acknowledged: true, 
            acknowledged_by: user.id, 
            acknowledged_at: new Date().toISOString(),
            acknowledgment_note: note || null,
          }
        : a
    ));
  }, [user]);

  const deleteAlert = useCallback(async (alertId: string) => {
    const { error: deleteError } = await supabase
      .from('invoice_alerts')
      .delete()
      .eq('id', alertId);

    if (deleteError) {
      console.error('Error deleting alert:', deleteError);
      throw deleteError;
    }

    setAlerts(prev => prev.filter(a => a.id !== alertId));
  }, []);

  const unacknowledgedCount = alerts.filter(a => !a.is_acknowledged).length;
  const criticalCount = alerts.filter(a => !a.is_acknowledged && a.severity === 'critical').length;
  const warningCount = alerts.filter(a => !a.is_acknowledged && a.severity === 'warning').length;
  const infoCount = alerts.filter(a => !a.is_acknowledged && a.severity === 'info').length;

  return {
    alerts,
    loading,
    error,
    refetch: fetchAlerts,
    acknowledgeAlert,
    deleteAlert,
    unacknowledgedCount,
    criticalCount,
    warningCount,
    infoCount,
  };
}

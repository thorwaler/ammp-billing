import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AssetStatusRecord {
  id: string;
  contract_id: string;
  customer_id: string;
  asset_id: string;
  asset_name: string;
  capacity_mw: number;
  status_change: 'appeared' | 'disappeared' | 'reappeared';
  detected_at: string;
  previous_seen_at: string | null;
  days_absent: number | null;
  sync_id: string | null;
  metadata: Record<string, any>;
  user_id: string;
  created_at: string;
}

export function useAssetStatusHistory(contractId: string) {
  return useQuery({
    queryKey: ['asset-status-history', contractId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('asset_status_history')
        .select('*')
        .eq('contract_id', contractId)
        .order('detected_at', { ascending: false });

      if (error) {
        console.error('Error fetching asset status history:', error);
        throw error;
      }

      return (data || []) as AssetStatusRecord[];
    },
    enabled: !!contractId,
  });
}

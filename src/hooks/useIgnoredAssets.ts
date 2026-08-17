import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  fetchIgnoredAssets,
  ignoreAsset,
  unignoreAsset,
  type IgnoredAsset,
} from '@/lib/ignoredAssets';

/**
 * Global list of assets marked as "not relevant" (zombie sites). Used to mute
 * zero-PV alerts and zero-capacity warnings without affecting pricing.
 */
export function useIgnoredAssets() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['ignored-assets'],
    queryFn: fetchIgnoredAssets,
    staleTime: 60 * 1000,
  });

  const rows: IgnoredAsset[] = data || [];
  const ignoredIds = new Set(rows.map((r) => r.asset_id));

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['ignored-assets'] }),
    [queryClient]
  );

  const toggle = useCallback(
    async (assetId: string, assetName?: string | null, reason?: string | null) => {
      const currentlyIgnored = ignoredIds.has(String(assetId));
      try {
        if (currentlyIgnored) {
          await unignoreAsset(assetId);
          toast.success(`${assetName || assetId} is monitored again`);
        } else {
          await ignoreAsset(assetId, assetName, reason);
          toast.success(`${assetName || assetId} ignored for alerts`);
        }
        await refresh();
      } catch (err: any) {
        toast.error(err?.message || 'Could not update the ignore list');
      }
    },
    [ignoredIds, refresh]
  );

  return {
    ignoredAssets: rows,
    ignoredIds,
    isLoading,
    isIgnored: (assetId: string) => ignoredIds.has(String(assetId)),
    toggle,
    refresh,
  };
}

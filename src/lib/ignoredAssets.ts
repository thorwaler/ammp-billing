/**
 * Globally ignored ("zombie") assets.
 *
 * Some AMMP sites have never reported PV data, or stopped years ago. They are
 * not worth chasing, but they keep triggering zero-PV alerts and zero-capacity
 * warnings. Marking an asset here silences it everywhere:
 *
 *  - no zero-PV incidents / alerts (see `_shared/zeroPvScan.ts`)
 *  - excluded from support-document data-quality warnings
 *  - hidden from the invoice revision dialog's zero lists
 *
 * Pricing is untouched — the site still appears in support documents, labelled
 * as ignored.
 *
 * A module-level cache backs the synchronous `isAssetIgnored` used by the
 * support-document renderers (including the jsPDF one, which cannot use hooks).
 */

import { supabase } from '@/integrations/supabase/client';

export interface IgnoredAsset {
  asset_id: string;
  asset_name: string | null;
  reason: string | null;
  created_at: string;
}

let cache: Set<string> = new Set();
let inflight: Promise<Set<string>> | null = null;

export function getIgnoredAssetIds(): Set<string> {
  return cache;
}

export function isAssetIgnored(assetId: string | null | undefined): boolean {
  return assetId != null && cache.has(String(assetId));
}

function setCache(ids: Iterable<string>) {
  cache = new Set([...ids].map(String));
}

export async function fetchIgnoredAssets(): Promise<IgnoredAsset[]> {
  const { data, error } = await supabase
    .from('ignored_assets')
    .select('asset_id, asset_name, reason, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data || []) as IgnoredAsset[];
  setCache(rows.map((r) => r.asset_id));
  return rows;
}

/** Loads the ignore list once and keeps the synchronous cache warm. */
export function loadIgnoredAssets(): Promise<Set<string>> {
  if (!inflight) {
    inflight = fetchIgnoredAssets()
      .then(() => cache)
      .catch(() => cache);
  }
  return inflight;
}

/** Forces the next `loadIgnoredAssets()` to hit the database again. */
export function invalidateIgnoredAssets() {
  inflight = null;
}

export async function ignoreAsset(
  assetId: string,
  assetName?: string | null,
  reason?: string | null
): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from('ignored_assets').upsert(
    {
      asset_id: String(assetId),
      asset_name: assetName ?? null,
      reason: reason ?? null,
      created_by: userData?.user?.id ?? null,
    },
    { onConflict: 'asset_id' }
  );
  if (error) throw error;
  cache.add(String(assetId));
  invalidateIgnoredAssets();
}

export async function unignoreAsset(assetId: string): Promise<void> {
  const { error } = await supabase
    .from('ignored_assets')
    .delete()
    .eq('asset_id', String(assetId));
  if (error) throw error;
  cache.delete(String(assetId));
  invalidateIgnoredAssets();
}

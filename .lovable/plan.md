

## Fix: Fetch Missing Onboarding Dates During AMMP Sync

### Problem

The bulk `/assets` endpoint doesn't consistently return the `created` field. For large syncs (>200 assets), device detail fetching is skipped, so there's no secondary source for this date. Result: many assets in `cached_capabilities.assetBreakdown` have `onboardingDate: null`, making them invisible on the MW growth chart.

### Solution

Add a targeted date-fetching pass in the edge function for assets that still have no `onboardingDate` after the main sync. The individual `/assets/{id}` endpoint (metadata only, no devices) reliably returns the `created` field.

### Changes

**File: `supabase/functions/ammp-sync-contract/index.ts`**

After the main sync loop completes and capabilities are merged (around line 497-500), add a post-processing step:

1. Identify assets in `allCapabilities` where `onboardingDate` is null
2. Batch-fetch their metadata via `/assets/{id}` (not `/assets/{id}/devices` — lighter call)
3. Update `onboardingDate` with the returned `created` field
4. Use the same batch size and timeout guards as the main loop

```typescript
// Post-process: fetch onboarding dates for assets missing them
const assetsMissingDate = allCapabilities.filter(a => !a.onboardingDate && a.assetId);
if (assetsMissingDate.length > 0) {
  console.log(`[AMMP Sync Contract] Fetching onboarding dates for ${assetsMissingDate.length} assets`);
  const DATE_BATCH = 50;
  for (let i = 0; i < assetsMissingDate.length; i += DATE_BATCH) {
    if (Date.now() - syncStartTime > MAX_SYNC_TIME_MS) break;
    const batch = assetsMissingDate.slice(i, i + DATE_BATCH);
    await Promise.all(batch.map(async (asset) => {
      try {
        const metadata = await fetchAMMPData(token, `/assets/${asset.assetId}`);
        if (metadata?.created) {
          asset.onboardingDate = metadata.created;
        }
      } catch { /* skip */ }
    }));
  }
}
```

**Also in `src/services/analytics/dashboardAnalytics.ts`** (lines 111-118):

As a safety net, also add the contract-level fallback so assets that still have no date after sync aren't dropped from analytics:

```typescript
// Change query to include signed_date, created_at
.select('cached_capabilities, customer_id, signed_date, created_at')

// Change filter from requiring onboardingDate to fallback
if (asset.totalMW) {
  const onboardingDate = asset.onboardingDate 
    || contract.signed_date 
    || contract.created_at;
  assetData.push({
    assetName: asset.assetName,
    totalMW: asset.totalMW,
    onboardingDate: onboardingDate,
  });
}
```

### Summary

| File | Change |
|------|--------|
| `supabase/functions/ammp-sync-contract/index.ts` | Add post-sync pass to fetch `created` date from `/assets/{id}` for assets missing `onboardingDate` |
| `src/services/analytics/dashboardAnalytics.ts` | Add `signed_date`/`created_at` fallback in `getAssetBreakdownFromContracts` as safety net |

The edge function fix ensures future syncs populate the date properly. The analytics fallback ensures existing data without dates still appears on the chart immediately (before a re-sync).




## Fix: MW Growth Not Showing for BLS/Brightlight With Date Filters

### Problem

In `getMWGrowthByMonth()` (line 458-463), the date filter **excludes** any asset whose `onboardingDate` is before the selected start date:

```typescript
if (filters?.startDate && onboardingDate < filters.startDate) return false;
```

This means if BLS and Brightlight assets were all onboarded before the selected range, they get dropped entirely — no data appears on the chart. For a cumulative MW growth chart, assets onboarded before the range should still count as the baseline.

### Fix

**File: `src/services/analytics/dashboardAnalytics.ts`** (lines 457-493)

Change the filtering logic so that:
1. Assets onboarded **before** `startDate` are included but bucketed into the first month of the range (as baseline cumulative MW)
2. Assets onboarded **after** `endDate` are excluded
3. Assets onboarded **within** the range appear in their actual month

```typescript
// Split assets: those before range contribute to baseline, those in range show as growth
let baselineMW = 0;
const filteredAssets: typeof assetData = [];

assetData.forEach(asset => {
  const onboardingDate = new Date(asset.onboardingDate);
  if (filters?.endDate && onboardingDate > filters.endDate) return; // exclude future
  if (filters?.startDate && onboardingDate < filters.startDate) {
    baselineMW += asset.totalMW; // accumulate as baseline
  } else {
    filteredAssets.push(asset);
  }
});

// Group in-range assets by month
const monthlyMap = new Map<string, number>();
filteredAssets.forEach(asset => {
  const date = new Date(asset.onboardingDate);
  const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + asset.totalMW);
});

// If no in-range months but we have baseline, create a single entry for the start month
if (monthlyMap.size === 0 && baselineMW > 0 && filters?.startDate) {
  const sk = `${filters.startDate.getFullYear()}-${String(filters.startDate.getMonth() + 1).padStart(2, '0')}`;
  monthlyMap.set(sk, 0);
}

// Sort and build cumulative starting from baseline
const sortedMonths = Array.from(monthlyMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
let cumulativeMW = baselineMW;
// ... rest builds result array with cumulativeMW starting from baseline
```

This way BLS/Brightlight assets onboarded before the selected range still appear as the baseline on the chart, and any new assets within the range show as growth.

### Files changed

| File | Change |
|------|--------|
| `src/services/analytics/dashboardAnalytics.ts` | Rework date filtering in `getMWGrowthByMonth` to preserve pre-range assets as baseline cumulative MW |


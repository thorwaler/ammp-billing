

## Fix: Contract ARR Too Low With Date Filters

### Problem

The new date range filter on `getTotalContractARR()` is over-filtering contracts, dropping ARR from ~€1,081k to ~€450k. The likely cause is:

1. **Null `signed_date`**: The contracts table has `signed_date` as nullable. The filter `.lte('signed_date', endDate)` excludes any contract where `signed_date` is NULL — effectively dropping contracts that never had a signing date recorded.

2. **Null `contract_expiry_date` handling may also interact**: Some contracts may have neither field set.

### Fix

**File: `src/services/analytics/dashboardAnalytics.ts`** (lines 1261-1267)

Update the date range filters to handle null values:

```typescript
// Filter by date range: only include contracts active during the selected period
if (filters?.startDate) {
  query = query.or(
    `contract_expiry_date.is.null,contract_expiry_date.gte.${filters.startDate.toISOString()}`
  );
}
if (filters?.endDate) {
  // Include contracts with no signed_date (treat as always existing)
  query = query.or(
    `signed_date.is.null,signed_date.lte.${filters.endDate.toISOString()}`
  );
}
```

This ensures contracts with a missing `signed_date` are still included (they're active, so they should count), while still filtering out contracts signed after the selected end date.

### Files changed

| File | Change |
|------|--------|
| `src/services/analytics/dashboardAnalytics.ts` | Handle null `signed_date` in date range filter |


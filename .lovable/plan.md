

## Filter Contract ARR by Active Date Range

### Problem

`getTotalContractARR()` ignores the date range filter entirely — it always returns ARR for all currently active contracts. When a custom date range is selected, the Contract ARR should only include contracts that were active during that period.

### Fix

**File: `src/services/analytics/dashboardAnalytics.ts`** (lines 1211-1259)

Add `signed_date` and `contract_expiry_date` to the select query, then apply date range filtering:

- A contract is "active during a range" if:
  - `signed_date <= endDate` (contract existed by the end of the range)
  - AND (`contract_expiry_date IS NULL` OR `contract_expiry_date >= startDate`) (contract hadn't expired before the range started)

Using Supabase query filters:
```typescript
if (filters?.startDate) {
  query = query.or(`contract_expiry_date.is.null,contract_expiry_date.gte.${filters.startDate.toISOString()}`);
}
if (filters?.endDate) {
  query = query.lte('signed_date', filters.endDate.toISOString());
}
```

This ensures that only contracts overlapping the selected date range contribute to the Contract ARR total.

### Files changed

| File | Change |
|------|--------|
| `src/services/analytics/dashboardAnalytics.ts` | Add date range filtering to `getTotalContractARR()` using `signed_date` and `contract_expiry_date` |


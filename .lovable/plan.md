

# Fix Duplicate Invoices from Xero Sync

## Root Cause
The Xero sync function (`xero-sync-invoices`) filters existing invoices by `user_id` for non-service (manual) calls (line 210-212). When user B manually syncs, they don't see invoices originally synced by user A, so the same Xero invoices get re-inserted. This created ~160 duplicate rows across 3 sync sessions (2025-12-04, 2026-04-01, 2026-04-07).

**Data impact**: 329 total invoices, 166 unique Xero invoice IDs, ~158 duplicates to remove.

## Plan

### 1. Remove existing duplicates via migration
Delete duplicate invoice rows, keeping only the **most recent** version for each `xero_invoice_id` (since later syncs may have updated status/amounts):

```sql
DELETE FROM invoices
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER(
        PARTITION BY xero_invoice_id 
        ORDER BY updated_at DESC NULLS LAST, created_at DESC
      ) as rn
    FROM invoices
    WHERE xero_invoice_id IS NOT NULL
  ) t
  WHERE t.rn > 1
);
```

### 2. Add unique constraint to prevent future duplicates
```sql
CREATE UNIQUE INDEX invoices_xero_invoice_id_unique 
ON invoices(xero_invoice_id) 
WHERE xero_invoice_id IS NOT NULL;
```

### 3. Fix the dedup query in xero-sync-invoices edge function
Remove the `user_id` filter from the existing-invoices dedup query. Since `xero_invoice_id` is globally unique (it comes from Xero), there's no reason to scope the dedup check to a single user. The function already uses the service role key, so RLS isn't a factor.

**Change** (line 210-212 of `xero-sync-invoices/index.ts`):
- Remove the `if (!isServiceCall && userId)` block that adds `.eq('user_id', userId)`
- Always query all invoices with a `xero_invoice_id` for dedup, regardless of caller

### 4. Use upsert for the insert path as a safety net
Change the insert on line 422 to use `upsert` with `onConflict: 'xero_invoice_id'` and `ignoreDuplicates: true`, so even if the application-level dedup somehow misses one, the database constraint catches it.

## Files to modify
- `supabase/functions/xero-sync-invoices/index.ts` — remove user_id filter from dedup query, use upsert
- Database migration — delete duplicates + add unique index


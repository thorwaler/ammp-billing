## Goal
1. Reset the SPS Investments Seychelles contract's prepaid balance to €100,000 so the Q2 invoice can be redone.
2. Make invoice deletion correctly restore the prepaid balance — including for legacy invoices that don't have `prepaid_balance_delta` recorded.

## Why deletion looked broken
The `prepaid_balance_delta` column shipped today (migration `20260630105053…`). The current Q2 SPS invoice was created on Apr 1 — before the column existed — so its `prepaid_balance_delta` is `NULL`. The delete handler in `src/pages/InvoiceHistory.tsx` only reverses the balance when a non-null delta is stored, so legacy invoices silently leave the balance untouched.

## Changes

### 1. Data reset (insert tool)
```sql
UPDATE contracts
SET ytd_invoiced_amount = 100000
WHERE id = '460a2fc6-af1b-401f-8b91-aaaccdfc98e3';
```

### 2. Robust deletion fallback — `src/pages/InvoiceHistory.tsx`
In `handleDeleteInvoice`, when `prepaid_balance_delta` is `NULL` and the invoice is not merged:

- Load the contract with its package / pricing_model + `annual_billing_anchor_date`.
- If the contract is `sps_monitoring` (with anchor) or `per_mw_annual_upfront`:
  - Determine whether the invoice's `invoice_date` is on an annual cycle using the existing `isAnnualUpfrontCycle` helper from `@/lib/invoiceScheduling`.
  - **Annual cycle invoice** → the invoice originally set the balance to the annual upfront amount. Reversal: set `ytd_invoiced_amount` back to `0` (per-MW) or to the prior balance for SPS. Since we can't reconstruct the prior balance from a legacy row, fall back to `0` and surface a toast noting the user may need to manually adjust if multiple legacy annual invoices existed.
  - **Quarterly cycle invoice** → derive the credit/overage amount from `xero_line_items` (look for the SPS credit line, description containing "Prepaid Credit Applied", or the per-MW overage line) and add/subtract it back to `ytd_invoiced_amount`.
- Keep the existing non-null-delta path unchanged.

This keeps new invoices fully automatic (delta column) and gives legacy invoices a best-effort restore with clear user feedback.

### 3. No schema changes
The column already exists; no new migration needed.

## Out of scope
- Backfilling `prepaid_balance_delta` on historical invoices (only one legacy SPS invoice exists and it's about to be deleted/recreated).
- Merged-invoice prepaid handling (still warned + skipped, as today).

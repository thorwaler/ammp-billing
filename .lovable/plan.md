## Fix: merged-invoice flow must update SPS / per-MW prepaid balance and persist per-contract deltas

### Problem
`MergedInvoiceDialog.tsx` updates each contract's period dates and inserts the merged invoice row, but it never debits `contracts.ytd_invoiced_amount` for `sps_monitoring` or `per_mw_annual_upfront` contracts, and never stores prepaid-balance deltas. Consequence: SPS contracts invoiced via a merged invoice don't decrement the prepaid balance, the next quarter's credit is wrong, and deletion is a silent dead end (the legacy fallback in `InvoiceHistory.handleDeleteInvoice` explicitly skips merged invoices).

### Changes

**1. `supabase/migrations/...` — add per-contract delta map column**
- `ALTER TABLE public.invoices ADD COLUMN prepaid_balance_deltas_by_contract jsonb;`
- Shape: `{ "<contract_id>": <signed_number>, ... }` — positive = balance went up (annual upfront billed), negative = credit applied. No backfill; legacy rows stay `null`.

**2. `src/components/invoices/MergedInvoiceDialog.tsx`**
Inside the existing `for (const contract of selectedContractsList)` loop that updates period dates (lines 583–613), for each contract whose calc `result` has `spsAnnualUpfrontBreakdown` or `perMWAnnualUpfrontBreakdown`, compute the new `ytd_invoiced_amount` using the same logic as `InvoiceCalculator.tsx` (lines ~1500–1540) and include it in the same `contracts` update call. Track the signed delta per contract in a local `Record<string, number>`.

When inserting the merged invoice row (line 627), add `prepaid_balance_deltas_by_contract: deltasByContract` (or omit when the map is empty so non-SPS merges stay clean).

**3. `src/pages/InvoiceHistory.tsx` — reverse deltas on merged-invoice deletion**
In `handleDeleteInvoice` (around line 277/355), before deleting:
- If `selectedInvoice.prepaid_balance_deltas_by_contract` is present, iterate the map and for each `[contractId, delta]` fetch the contract's current `ytd_invoiced_amount` and write back `current - delta` (clamped at 0 when appropriate, mirroring single-contract logic).
- Drop the "merged; skipping reversal" early-return; only fall through to the legacy Xero-line fallback when neither `prepaid_balance_delta` nor the new map is set.

### Out of scope
- The `(x as any).spsAnnualUpfrontBreakdown` cast cleanup — leaving for later as agreed.
- Schema types regen runs automatically after the migration; code reading the new column uses it via the regenerated `Database` type (no manual `as any` needed afterward).

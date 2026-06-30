## Goal

1. Reset the SPS Investments Seychelles Ltd prepaid balance to €100,000 so the Q2 invoice can be redone.
2. Make deleting any invoice automatically reverse whatever effect it had on the contract's prepaid balance (`contracts.ytd_invoiced_amount`), so resets aren't needed manually next time.

## Approach

Store the signed prepaid-balance change on each invoice at creation time, then reverse it on deletion.

### 1. Data reset (no code, data only)
- Set `contracts.ytd_invoiced_amount = 100000` for the SPS contract (`460a2fc6-af1b-401f-8b91-aaaccdfc98e3`).

### 2. Schema change — `invoices.prepaid_balance_delta`
- Add a nullable `numeric` column `prepaid_balance_delta` to `public.invoices`.
- Semantics: signed change applied to the related contract's `ytd_invoiced_amount` when this invoice was created.
  - SPS quarterly with credit: negative (e.g. `-25,183.54`) — balance went down.
  - SPS annual upfront: `newBalance − oldBalance` (typically positive when the annual upfront tops up).
  - Per-MW + Annual Upfront: positive YTD increment (or `newYtd − oldYtd` on the annual reset).
  - Everything else: `NULL` (no effect).

### 3. Write the delta on invoice creation
In `src/components/dashboard/InvoiceCalculator.tsx` (around lines 1482–1532), capture `oldYtd` from `contractRow` and compute `delta = newYtd − oldYtd` for both branches:
- `isAnnualUpfrontContract` (per-MW annual upfront)
- `isSpsDualCadence` (SPS monitoring)

Persist `prepaid_balance_delta = delta` on the inserted invoice row alongside the existing contract update.

### 4. Reverse the delta on invoice deletion
In `src/pages/InvoiceHistory.tsx` `handleDeleteInvoice` (lines 207–287):
- Before the delete, read `prepaid_balance_delta` from the selected invoice (already on `Invoice` after the schema change; otherwise fetch it).
- After deletion, for each affected contract id (single or merged), if `delta` is non-null and non-zero:
  - Fetch the contract's current `ytd_invoiced_amount`.
  - Update it to `current − delta` (reverses both increments and decrements).
- Existing period/next-date reset logic stays unchanged.

Merged invoices: the per-contract delta isn't separated today. Since SPS/Per-MW-Annual contracts are never part of merged invoices in current usage, we'll apply the delta only when the invoice is single-contract (`contract_id` set, no `merged_contract_ids`). If a merged invoice has a delta, log a warning and skip the reversal rather than mis-apply it.

### 5. Types
After the migration runs, `src/integrations/supabase/types.ts` is regenerated automatically and `Invoice` picks up the new field — no manual type edits needed.

## Files touched

- Migration (new): add `prepaid_balance_delta` to `invoices`.
- Data update (insert tool): reset SPS `ytd_invoiced_amount` to 100000.
- `src/components/dashboard/InvoiceCalculator.tsx`: write delta on create.
- `src/pages/InvoiceHistory.tsx`: reverse delta on delete.

## Out of scope

- Backfilling `prepaid_balance_delta` on historical invoices — only newly created invoices will carry the delta. Historical deletes will continue to require a manual reset (only relevant for SPS / per-MW annual contracts).

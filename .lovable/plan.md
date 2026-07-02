## Post-change cleanup review

After walking through today's changes (AMMP cron fix, SharePoint delete-on-invoice-delete, SPS/per-MW annual upfront, Matriarch breakdown, merged-invoice per-contract deltas, support doc polish), here's what's worth cleaning up. Nothing is broken — this is hygiene, not bug fixing.

### 1. Extract prepaid-balance reversal from `InvoiceHistory.handleDeleteInvoice`

The delete handler is now ~230 lines and does five different things inline: SharePoint cleanup, contract-date reset, single-contract delta reversal, legacy-fallback reversal from Xero line items, and merged-map reversal. Move to a small helper module:

- `src/lib/prepaidBalance.ts` with:
  - `reverseSingleContractDelta(invoice)`
  - `reverseLegacyFromLineItems(invoice, contract)`
  - `reverseMergedDeltas(invoice)`
- Handler becomes a linear `await` sequence, easy to read and test.

### 2. Consolidate SharePoint file refs into one shape

Right now single invoices write `sharepoint_file_id` + `sharepoint_drive_id`, merged invoices write `sharepoint_files` (JSONB array), and the delete path has to check both. Keep both columns for back-compat, but:

- Add a `getSharePointFileRefs(invoiceRow)` helper in `src/utils/sharePointUpload.ts` that always returns `Array<{driveId, fileId}>`.
- Delete handler calls that single helper instead of branching on shape.

### 3. Type the new invoice columns properly

`prepaid_balance_delta`, `prepaid_balance_deltas_by_contract`, `sharepoint_file_id`, `sharepoint_drive_id`, `sharepoint_files` are all accessed via `(x as any)` casts. The generated `types.ts` already has them (migrations ran). Sweep the codebase and drop the casts so TS actually checks these paths.

### 4. Split `InvoiceCalculator.tsx` (3,182 lines)

Not a today-only problem, but today's SPS + per-MW annual upfront + SharePoint persistence pushed it past a comfortable size. Minimum viable split:

- `useInvoiceCalculation` hook — all the calculation `useMemo` blocks and dependent state.
- `useSaveInvoice` hook — the save/upload/persist chain including SharePoint ref persistence and `ytd_invoiced_amount` update.
- Component keeps only rendering + wiring.

Same pattern already applied elsewhere; low risk if done as pure move-and-rename.

### 5. Deduplicate SPS / per-MW annual-upfront serialization

`InvoiceCalculator.tsx` and `MergedInvoiceDialog.tsx` both build Xero line items for SPS credit lines and per-MW overage lines, and both compute `prepaid_balance_delta`. Extract to `src/lib/invoicePersistence.ts`:

- `buildDualCadenceXeroLines(breakdown)`
- `computePrepaidDelta(breakdown)` (returns scalar for single, map for merged)

Guarantees the two entry points stay in sync — this is exactly where the recent "Xero shows different numbers than the calculator" bug came from.

### 6. `ammp-scheduled-sync`: finish the plan-file's item 4

`.lovable/plan.md` promised a scheduled-path failure notification. The current cron branch does per-user error notifications inside the loop, but a top-level `try/catch` failure (e.g. `getSharedAmmpConnection` throws) still returns 500 silently with no notification. Add one `notifications` insert in the outer `catch` before the 500 response, targeting the shared connection's `user_id` (fetched best-effort).

### 7. Small dead-weight

- `src/pages/InvoiceHistory.tsx` imports `deleteMultipleFromSharePoint` dynamically inside the handler — fine, but pair it with `deleteFromSharePoint` (unused now) audit; if nothing calls the single-file version, drop it.
- `supabase/functions/ammp-scheduled-sync/index.ts` still has the `isServiceRoleRequest` variable set but only read once as a guard that can never fail on the cron branch (we set it to `true` ourselves). Simplify.

### 8. Memory update

Add one short memory file `mem://architecture/prepaid-balance-persistence` documenting: delta column on single invoices, per-contract map on merged, reversal on delete, legacy fallback. This is the piece most likely to trip up a future change.

### Out of scope

- No calculation logic changes.
- No schema changes.
- No UI changes visible to the user.

### Order of work

1, 3, 7, 8 first (mechanical, low risk). Then 2 and 5 (small refactors with shared helpers). Then 6 (edge function redeploy). Then 4 (bigger, do last so review is isolated).

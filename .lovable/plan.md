## Context

- Item 2 (the lower invoice) is explained and accepted — no change.
- Item 1: freezing at invoice date is the intended behaviour, but it is not currently wired up. `src/lib/invoiceSnapshot.ts` defines the snapshot shape, `buildSnapshot()` and the 30-day revision window, and the `invoices` table already has `input_snapshot`, `snapshot_frozen_at`, `revision_deadline`, `revised_from_invoice_id` — yet `buildSnapshot()` is never called and existing invoices have null snapshots.
- New: freezing must be switchable off per contract so you can re-run test invoices against live data.

## Plan

### 1. Freeze on invoice creation
In `InvoiceCalculator.tsx` and `MergedInvoiceDialog.tsx`, build and store the snapshot when the invoice row is inserted (unless freezing is disabled for the contract):
- resolved asset list (id, name, MWp, zero-PV substitution info)
- per-org tier, rate and eConf status for Elum org-tier contracts
- contract rate configuration at freeze time
- period start/end, currency, EUR exchange rate
- final totals and the Xero line items sent
- `snapshot_frozen_at = now`, `revision_deadline = now + 30 days`

### 2. Freeze toggle (the testing switch)
- New boolean column `invoice_freeze_enabled` on `contracts`, default `true`.
- Switch in `ContractForm.tsx` ("Freeze invoice inputs at creation") with helper text explaining that turning it off means support documents always regenerate from live data — intended for testing. Wire it through `src/lib/contractFormMapping.ts` so editing a contract never silently resets it.
- When off: no snapshot is written, and the invoice shows a "Live data" badge instead of a freeze badge.
- Per-invoice escape hatch: a "Freeze this invoice" checkbox in the calculator, pre-set from the contract setting, so you can override for one run without editing the contract.

### 3. Support document reads the snapshot
`supportDocumentGenerator.ts` / `SupportDocument.tsx`: when a saved invoice has `input_snapshot`, render from it instead of live `cached_capabilities`. Invoices without a snapshot keep today's behaviour and show a "regenerated from live data — not frozen" note.

### 4. Make it verifiable
In Invoice History, per invoice:
- badge: "Frozen 30 Sep 2026 · revisable for N days", or "Live data (not frozen)"
- a snapshot detail panel with frozen site count, total MWp, per-org rates and totals, to compare against Xero

### 5. Revision within the window
For frozen invoices still inside 30 days, a "Revise" action creates a new invoice with `revised_from_invoice_id` set, showing a diff (MWp, site count, org membership, total) before confirming.

### How to check it
1. Generate an invoice with freezing on — badge and snapshot panel appear and match Xero.
2. Re-sync the contract, regenerate the support document: numbers unchanged.
3. Turn the toggle off on a test contract, repeat: numbers now follow live data.

### Technical notes
- One migration: `ALTER TABLE public.contracts ADD COLUMN invoice_freeze_enabled boolean NOT NULL DEFAULT true;` (no new table, so no new grants needed).
- Files: `src/components/dashboard/InvoiceCalculator.tsx`, `src/components/invoices/MergedInvoiceDialog.tsx`, `src/components/contracts/ContractForm.tsx`, `src/lib/contractFormMapping.ts`, `src/lib/supportDocumentGenerator.ts`, `src/components/invoices/SupportDocument.tsx`, `src/pages/InvoiceHistory.tsx`, `src/lib/invoiceSnapshot.ts`.

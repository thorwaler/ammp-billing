# Fix off-by-one billing periods (30 Jun – 29 Sep instead of 1 Jul – 30 Sep)

## What is actually happening

Verified in the database: five Elum SAS contracts currently store
`period_start = 2026-06-30`, `period_end = 2026-09-29`, `next_invoice_date = 2026-09-30`,
while the other Elum contracts correctly store `2026-07-01 … 2026-09-30`.

The app uses two conflicting conventions for what a billing period is:

- Invoice creation (`InvoiceCalculator`, standard frequency branch): `period_end` equals
  `next_invoice_date` and the new `period_start` is the previous invoice date + 1 day.
  This yields 1 Jul – 30 Sep. Correct.
- Invoice deletion (`InvoiceHistory`, contract-date restore): it rebuilds the period as
  `period_end = invoiceDate - 1 day` and `period_start = period_end - 3 months + 1 day`.
  For a 30 Sep invoice this produces exactly 30 Jun – 29 Sep — the reported symptom.
  The contracts showing the wrong dates are the ones whose invoice was deleted.

A third inconsistency exists in the dual-cadence branches (per-MW annual upfront and SPS,
in both `InvoiceCalculator` and `MergedInvoiceDialog`): they set
`period_end = next_invoice_date - 1 day`, which will drift the same way one cycle later.

## The fix

1. Adopt one convention everywhere: **`period_end` equals `next_invoice_date`** (the invoice
   date closes the period), and **`period_start` is the previous invoice date + 1 day**.
2. Add a single shared helper (in `src/lib/invoiceScheduling.ts`) that derives
   `{ period_start, period_end, next_invoice_date }` from an invoice date + frequency, so the
   three call sites cannot drift apart again.
3. Rewrite the delete-restore block in `src/pages/InvoiceHistory.tsx` to use the helper:
   restore `period_end = deleted invoice date`, `period_start = invoice date − frequency + 1 day`,
   `next_invoice_date = invoice date`.
4. Align the dual-cadence branches in `InvoiceCalculator.tsx` and `MergedInvoiceDialog.tsx`
   to drop the `-1 day` on `period_end`.
5. Data repair: correct the five Elum SAS contracts to `period_start = 2026-07-01`,
   `period_end = 2026-09-30`, and scan for any other contract where
   `period_end <> next_invoice_date` and normalise those too.

## Technical notes

- All period arithmetic stays on UTC midnight timestamps, matching the existing stored values,
  so CET display (`formatDateCET`) continues to show the intended calendar day.
- No pricing logic changes; `monthsInPeriod` still returns 3 for a 1 Jul – 30 Sep quarter,
  whereas today the 30 Jun – 29 Sep variant returns 4, which also skews prorated flat fees.
  Fixing the dates fixes that as a side effect.

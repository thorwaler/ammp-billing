## Problem

The Invoice Calculator displays the correct billing period (e.g. April 1 – April 30, 2026 = 1 month), but the cost calculation still multiplies by the full quarterly multiplier (3 months). For Bright Light this produced €5,017.54 instead of ~€1,672.51, because `frequencyMultiplier` is derived only from `billingFrequency` (quarterly → 3), ignoring the actual period length.

## Root cause

In `src/components/dashboard/InvoiceCalculator.tsx` (`buildCalculationParams`, ~line 803):

```ts
let frequencyMultiplier = getFrequencyMultiplier(billingFrequency); // always 3 for quarterly
```

It is only overridden for the *first* invoice via `calculateProrationMultiplier(signedDate, firstInvoiceDate, …)`. Catch-up / short periods (when `periodStart`–`periodEnd` spans fewer months than the billing frequency) are not handled, so every per-MW branch in `invoiceCalculations.ts` that uses `frequencyMultiplier` (hybrid tiered, Elum ePM, Jubaili, graduated, per-MW annual upfront overage, etc.) over-charges.

The same issue exists in `MergedInvoiceDialog.tsx`, which builds per-contract params the same way.

## Fix

1. **Add a shared helper** in `src/lib/invoiceScheduling.ts` (or `dateUtils.ts`):

   ```ts
   // Inclusive month count between two YYYY-MM-DD dates (CET-safe)
   export function monthsInPeriod(periodStart: string, periodEnd: string): number
   ```

   Returns `(endYear-startYear)*12 + (endMonth-startMonth) + 1`, clamped to ≥1.

2. **`InvoiceCalculator.tsx` – `buildCalculationParams`**:
   - When `selectedCustomer.periodStart` and `periodEnd` are both present, compute `actualMonths = monthsInPeriod(...)`.
   - Compare to `getFrequencyMultiplier(billingFrequency)`; if `actualMonths < frequencyMultiplier`, set `frequencyMultiplier = actualMonths` and update `invoicePeriodDisplay` to reflect the short period (already correct from `getInvoicePeriodText`).
   - Keep the existing first-invoice proration path; the new logic only kicks in when proration didn't already shorten the multiplier.

3. **`MergedInvoiceDialog.tsx`** – apply the same override per contract where `frequencyMultiplier` is constructed.

4. **Display labels**: The "× 3 months" text in the hybrid tiered breakdown line is rendered from the calculation (`InvoiceCalculator.tsx` line items + `MergedInvoiceDialog`). Update those template strings to use the actual months value instead of hardcoded `3 months` / `frequencyMultiplier` so the UI says "× 1 month" for short periods. Same review pass for the other per-MW branches that print "× N months".

5. **Support document & Xero line items**: Already derive cost from `result.*` values, so they will automatically inherit the corrected amount once `frequencyMultiplier` is right. Verify the label strings in `supportDocumentGenerator.ts` for hybrid tiered / per-MW lines and switch any hardcoded "3 months" to the actual months value.

## Out of scope

- No schema changes; `periodStart`/`periodEnd` already drive the period.
- No changes to how `period_end` is advanced after invoice creation (handled separately by `invoiceScheduling.ts`).
- Full first-invoice proration logic (sub-month days) stays as-is; this fix only addresses whole-month catch-up periods.

## Verification

- Reopen the Bright Light calculator for April 1–30, 2026: total should drop from €5,017.54 to ~€1,672.51 (1/3 of the prior amount); line items should read "× 1 month".
- A normal quarterly period (3 months) should be unchanged.
- A 2-month catch-up period should produce 2/3 of the quarterly amount.

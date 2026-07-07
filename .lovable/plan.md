## Problem

Forest Energy's latest invoice is on a quarterly contract but the actual billing period is shorter than 3 months (catch-up / partial period). The Satellite Data API (Solcast) fee is being charged for a full quarter — 3 × sites × price — instead of only the months in the actual invoice period.

The support document's "Solcast Fee Breakdown" table already handles this correctly (`getMonthsForPeriod` respects `periodStart`/`periodEnd`), but the calculator that produces the invoice total does not.

## Root cause

In `src/lib/invoiceCalculations.ts`, inside `calculateAddonCosts`:

1. **Pro-rata path (line 507–536)** calls `getMonthsForPeriodCalc(billingFrequency, invoiceDate, periodStart, periodEnd)`. That helper (line 452) ignores `periodStart`/`periodEnd` entirely and always walks back `getPeriodMonthsMultiplier(billingFrequency)` months from the invoice date — so quarterly always yields 3 months.

2. **Flat fallback (line 540–542)** — used when there is no per-asset Solcast breakdown — multiplies the tiered price by `getPeriodMonthsMultiplier(billingFrequency)`, again always 3 for quarterly.

Both produce a 3-month Solcast fee regardless of the actual period length.

## Fix

### 1. `src/lib/invoiceCalculations.ts` — `getMonthsForPeriodCalc`

When `periodStart` and `periodEnd` are both provided, generate the list of months between them (mirroring `getMonthsForPeriod` in `supportDocumentGenerator.ts`, including its local-date parsing to avoid timezone drift). Fall back to the current invoice-date-based walk-back only when period dates are missing.

### 2. `src/lib/invoiceCalculations.ts` — flat Satellite Data API fallback (line 540–542)

Replace the `getPeriodMonthsMultiplier(billingFrequency)` multiplier with the actual month count derived from `periodStart`/`periodEnd` when both are available (using the same month-counting logic). Keep the current nominal-quarter multiplier as fallback when period dates are missing.

### 3. `src/lib/supportDocumentGenerator.ts` — historical reconstruction (line 665–677)

This branch reconstructs a Solcast fee from `calculatedTieredPrice.totalPrice` × nominal quarter months for legacy invoices without a stored `cost`. Leave the fallback in place, but prefer the addon's own stored `cost` when present (already the first branch) so newly-created invoices are unaffected. No behavior change for current data — noted only so we don't accidentally regress the fix while touching adjacent code.

## Verification

- Manually re-open the latest Forest Energy invoice in the calculator: Solcast line should equal `sites × price × (months in period)` instead of `sites × price × 3`.
- The support document's Solcast Fee Breakdown table row count should match the calculator's month count.
- Re-check a full-quarter invoice (e.g. the June 30 Forest Energy invoice with `cost: 279`) — number must remain `93 × 3 = 279`.
- Typecheck.

## Out of scope

- Any change to the pro-rata onboarding-date logic itself.
- Historical invoices already saved with the wrong amount (user can regenerate them).
- Merged-invoice path (uses the same helpers; benefits automatically).

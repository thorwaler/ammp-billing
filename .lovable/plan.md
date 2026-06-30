## Goal
The Calculation Breakdown total already nets out the SPS prepaid credit, but the credit line itself isn't shown — so the listed rows don't add up to the total. Insert an explicit "− Prepaid Credit Applied" row right before the total whenever an SPS quarterly-with-credit cycle applied a credit.

## Changes

**`src/components/invoices/PdfRenderer.tsx`** (Calculation Breakdown section, before line 457 `= Support Document Total`):
- If `data.spsAnnualUpfrontBreakdown?.cycleType === 'quarterly_with_credit'` and `creditApplied > 0`, push a row: `['− Prepaid Credit Applied', \`-${fmt(creditApplied, cur)}\`]`.

**`src/components/invoices/SupportDocument.tsx`** (Calculation Breakdown list, just before the "= Support Document Total" row):
- Same conditional row, styled like the existing credit/adjustment lines (amber `#d97706`), showing `−{formatCurrency(creditApplied)}`.

No calculation logic changes; the stored `calculatedTotal` already reflects the net so the math will reconcile once the row is visible.

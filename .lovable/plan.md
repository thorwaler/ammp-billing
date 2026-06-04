# Fix support document mismatch for per-MW annual upfront billing

## Goal
Make the support document reconcile exactly to the invoice total for the `per_mw_annual_upfront` package.

## What I’ll change
1. Update the support-document total builder so the annual floor is represented only once.
   - Keep the asset table as the annual MW-based subtotal.
   - Keep the minimum contract adjustment as the delta up to the annual floor.
   - Stop using the annual floor itself as the separate `assetBreakdownPeriod` amount for annual-upfront cycles, because that duplicates the minimum in the final total.

2. Keep the existing support-document explanation intact, but make the calculation breakdown match the same logic.
   - Annual-upfront cycle should show:
     - asset subtotal from synced MW
     - minimum adjustment only when the fixed annual minimum exceeds the MW subtotal
     - final support-document total equal to the invoice total
   - Quarterly overage cycle should still show only the overage amount.

3. Verify the per-MW annual-upfront path against the current rendering rules.
   - Confirm the mismatch row disappears.
   - Confirm the support doc still shows the annual floor logic clearly.

## Expected result
For a case like 7.30 MW × €1,250 = €9,137.18-ish below a €14,500 floor, the document should show:
- asset subtotal based on synced MW
- minimum contract adjustment for the gap
- support document total = €14,500.00
- totals match

## Technical details
- File to update: `src/lib/supportDocumentGenerator.ts`
- Likely fix: in the `perMWAnnualUpfrontBreakdown` annual-upfront branch, use the asset-based subtotal (`mwBasedFloor` / asset rows) in the breakdown math instead of `annualFloor`, so the minimum adjustment is not added twice.
- `src/components/invoices/SupportDocument.tsx` likely does not need structural changes unless a label needs tightening after the data fix.
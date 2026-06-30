## Goal
Surface the SPS prepaid-balance details (annual upfront amount, balance before/after, credit applied this quarter) on the support document PDF — the on-screen support doc already shows this, but the PDF renderer skips it.

## Changes

**`src/components/invoices/PdfRenderer.tsx`** — add an "SPS Annual Upfront Billing" section right after the existing SPS Discount Breakdown block (around line 393), gated on `data.spsAnnualUpfrontBreakdown`.

Rendered as a single two-column table:

- Cycle: `Annual upfront (year start)` or `Quarterly with prepaid-balance credit`
- Discounted Annual SPS Value
- Annual Minimum Floor
- Annual Upfront Amount (max of the two)

If `cycleType === 'quarterly_with_credit'`, append:
- Full Quarterly Fee
- Prepaid Balance Before
- Credit Applied This Quarter (negative)
- Prepaid Balance Remaining
- Net Charged This Quarter (= quarterCost − creditApplied)

All values formatted with the contract currency via the existing `fmt(..., cur)` helper. Mirrors the on-screen SupportDocument.tsx block (lines 303–337) so screen and PDF match.

No changes to calculation logic, data shape, or other packages.

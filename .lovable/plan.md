## Problem

For the SPS Apr–Jun invoice the in-app calculator now correctly nets the Technical Monitoring fee against the €100k prepaid balance, but Xero still shows the full €25,183.54 Technical Monitoring line with no credit applied.

## Root cause

In `src/components/dashboard/InvoiceCalculator.tsx`, the SPS Xero block (the one that pushes either an annual-upfront line or a negative `Annual Minimum Already Paid — credit applied …` line) is accidentally nested inside the `if (result.perMWAnnualUpfrontBreakdown) { … }` block.

Current structure around lines 1057–1105:

```text
if (result.perMWAnnualUpfrontBreakdown) {        // line 1058
  if (b.cycleType === 'annual_upfront') { … }
  else if (b.overageAmount > 0) { … }            // closes at line 1078

  // SPS Monitoring annual-upfront dual cadence  // line 1080
  if (result.spsAnnualUpfrontBreakdown) { … }    // lines 1081–1103
}                                                 // line 1105 closes the perMW if
```

Because `perMWAnnualUpfrontBreakdown` is never set for SPS contracts, the SPS block never executes → no negative credit line is sent to Xero, so the full Technical Monitoring amount is invoiced.

## Fix

1. In `src/components/dashboard/InvoiceCalculator.tsx`, close the `if (result.perMWAnnualUpfrontBreakdown)` block immediately after the per-MW branches (after the existing line 1078), so the SPS block at 1080–1103 becomes a sibling, not a child:

   ```text
   if (result.perMWAnnualUpfrontBreakdown) {
     if (b.cycleType === 'annual_upfront') { … }
     else if (b.overageAmount > 0) { … }
   }   // <-- new close here

   if (result.spsAnnualUpfrontBreakdown) {
     if (sb.cycleType === 'annual_upfront') { … push upfront line … }
     else if (sb.creditApplied > 0) { … push negative credit line … }
   }
   ```

   And remove the stray closing brace currently on line 1105 that was closing the (now-unneeded) outer wrapper.

2. Re-verify with the SPS test contract that, for the Apr–Jun period:
   - Xero line items contain: `Technical Monitoring €25,183.54`, `Annual Minimum Already Paid — credit applied … −€20,885.97`, `Satellite Data API Access €688.00`.
   - Xero total ≈ €4,985.57.
   - For the annual-cycle invoice on the anchor date, only the single `Annual Platform Fee — …` line is emitted (no per-module lines), matching the existing in-app waterfall.

3. Spot-check `MergedInvoiceDialog.tsx` SPS branch (around line 278) to confirm it is not similarly mis-nested. If it is, apply the same structural fix.

No business-logic, calculation, or DB changes — purely a brace/scope fix so the existing SPS Xero line-item code actually runs.

## Fix: support document doesn't handle per_mw_annual_upfront

### Root cause

`src/lib/supportDocumentGenerator.ts` has dedicated branches for siteMinimum / perSite / Elum / Matriarch breakdowns but **no branch for `per_mw_annual_upfront`**. The contract falls through to the default `else` (line 429–433), which does:

```ts
assetBreakdownPeriodTotal = assetBreakdownTotal * frequencyMultiplier;
minimumChargesForBreakdown = calculationResult.minimumCharges;
```

That sums to the raw MW × rate value — not the annual floor that `calculateInvoice` writes into `result.totalPrice`. So:

- The "Asset Breakdown (period)" row shows MW × rate, missing the annual minimum fee.
- `calculatedTotal` ≠ `invoiceTotal`, so `totalsMatch` flips to false and the doc shows a discrepancy warning.
- There is no row anywhere that explains the floor (`max(committedMW × rate, fixedAnnualMinimum)`) or the quarterly overage.

The renderer in `src/components/invoices/SupportDocument.tsx` also has no per_mw_annual_upfront branch.

### Fix

1. **`src/lib/supportDocumentGenerator.ts`**
   - Extend `SupportDocumentData` with:
     ```ts
     perMWAnnualUpfrontBreakdown?: {
       cycleType: 'annual_upfront' | 'quarterly_overage';
       perMWpRate: number;
       committedMinimumMW: number;          // from contract
       committedMinimumFloor: number;       // committedMW × rate
       fixedAnnualMinimum: number;
       annualFloor: number;                 // max of the two above
       ytdModuleValue: number;
       ytdInvoiced: number;
       overageAmount: number;
       currentMW: number;                   // for display
     };
     ```
   - Populate it from `calculationResult.perMWAnnualUpfrontBreakdown` (already produced by `calculateInvoice`). Pull `committedMinimumMW` from the contract record (already fetched in the generator's contract lookup, or pass it through alongside `minimumAnnualValue`).
   - Add a new branch in the `assetBreakdownPeriodTotal` if/else chain (around line 425):
     ```ts
     } else if (calculationResult.perMWAnnualUpfrontBreakdown) {
       const b = calculationResult.perMWAnnualUpfrontBreakdown;
       assetBreakdownPeriodTotal = b.cycleType === 'annual_upfront'
         ? b.annualFloor
         : b.overageAmount;
       minimumChargesForBreakdown = 0;
     }
     ```
     This makes `calculatedTotal === invoiceTotal` (both equal `result.totalPrice`), so `totalsMatch` becomes true.

2. **`src/components/invoices/SupportDocument.tsx`**
   - Add a top-level breakdown card (similar to the Elum and per-site cards, ~line 209) titled "Per-MW + Annual Upfront Minimum" that lists, when `data.perMWAnnualUpfrontBreakdown` is present:
     - Cycle type (Annual upfront / Quarterly overage)
     - Per-MWp rate, current MW
     - Committed minimum MW × rate = committed floor
     - Fixed annual minimum
     - **Annual floor** = max of the two (highlighted)
     - For quarterly_overage cycle: YTD module value, YTD invoiced, overage charged
   - Add a branch in the totals reconciliation section (the `data.perSiteBreakdown ? (...) : (...)` chain around line 564) to show:
     - Annual cycle: a single line `Annual Platform Fee — Minimum: {annualFloor}`.
     - Quarterly cycle: `Per-MW Quarterly Overage: {overageAmount}`.

3. **No DB / no calculation changes** — `calculateInvoice` and the contract record already carry every needed value.

### Out of scope

- Don't touch any other package's branch.
- No changes to PDF export shell — it reuses the same `SupportDocument` component.

### Files to touch

- `src/lib/supportDocumentGenerator.ts` — interface + branch + populate.
- `src/components/invoices/SupportDocument.tsx` — render section + totals branch.

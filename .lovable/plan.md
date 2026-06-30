## Fix: Xero SPS quarterly invoice — Technical Monitoring line uses pre-discount fee

### Root cause

In `src/lib/invoiceCalculations.ts` (SPS dual-cadence quarterly branch, ~line 1102), `result.moduleCosts` is scaled to the period using **pre-discount** annual module costs:

```ts
result.moduleCosts = annualModuleCosts.map(mc => ({ ...mc, cost: mc.cost * periodFraction }));
```

But the credit and the calculator's "Quarterly Monitoring Fee" use **post-discount** `quarterCost = annualDiscountedFee × periodFraction`. So Xero gets:

- Technical Monitoring (pre-discount, ×0.25): **25,183.54**
- Credit (post-discount): **−20,885.97**
- Net monitoring: **4,297.57** (wrong; should be 0)

The calculator UI hides this because it renders the SPS waterfall from `spsAnnualUpfrontBreakdown` (post-discount), not from `moduleCosts`.

### Change

In `src/lib/invoiceCalculations.ts`, in the `cycleType === 'quarterly_with_credit'` branch only:

- Scale each module cost by `periodFraction × (annualDiscountedFee / preDiscountAnnualFee)` so the line items sum to `quarterCost` (post-discount) instead of the pre-discount quarter value.
- Guard division-by-zero (if `preDiscountAnnualFee === 0`, leave moduleCosts empty).

This keeps the per-module Xero lines (Technical Monitoring, etc.), but each now reflects its share of the discounted quarterly fee, so credit fully nets to €0 when prepaid balance covers it.

### Verification

After fix, the SPS Apr–Jun invoice in Xero should show:

- Technical Monitoring: **20,885.97**
- Credit: **−20,885.97**
- Satellite Data API Access: **688.00**
- Total: **688.00** (matches the calculator)

### Files touched

- `src/lib/invoiceCalculations.ts` — adjust module-cost scaling in the SPS `quarterly_with_credit` branch.

## Problem

For the `per_mw_annual_upfront` contract, the invoice calculator shows **€5,362.82** instead of the **€14,500** annual minimum.

That value is exactly `14,500 − 9,137 YTD`, which is the **quarterly overage** branch in `invoiceCalculations.ts`. The calculator is being routed there because:

- `InvoiceCalculator.tsx` does not pass `perMWAnnualUpfrontIsAnnualCycle`.
- The fallback in `invoiceCalculations.ts` compares `params.periodStart` month vs the anchor month. The contract's `periodStart` is not in the anchor month (June), so it returns `false` → quarterly overage cycle → catch-up to floor minus existing YTD.

The Upcoming Invoices list already handles this correctly using `isAnnualUpfrontCycle(invoiceDate, annualBillingAnchorDate)` from `src/lib/invoiceScheduling.ts`. The manual calculator just isn't using the same helper.

## Fix

In `src/components/dashboard/InvoiceCalculator.tsx`, inside `buildCalculationParams` (around line 879–882), set the annual-cycle flag explicitly using the chosen `invoiceDate` and the contract's anchor:

```ts
import { isAnnualUpfrontCycle } from "@/lib/invoiceScheduling";

// inside buildCalculationParams params object:
perMWAnnualUpfrontIsAnnualCycle:
  selectedCustomer.package === 'per_mw_annual_upfront'
    ? isAnnualUpfrontCycle(invoiceDate ?? new Date(), selectedCustomer.annualBillingAnchorDate)
    : undefined,
```

With anchor = June 4 and `invoiceDate` in June, this returns `true`, so the calculator enters the `annual_upfront` branch and `cycleAmount = annualFloor = 14,500`. YTD is no longer subtracted on the annual cycle invoice.

## Out of scope

- No changes to `invoiceCalculations.ts`. The annual/quarterly branches there are correct; they just need the right input.
- No changes to YTD storage, schema, or the post-send YTD rollover logic (`handleSendToXero` still uses `isAnnualUpfrontCycle` independently for the DB update).
- No changes to `UpcomingInvoicesList.tsx` — it already uses this helper.

## Validation

1. Open the per-MW + Annual Upfront contract in the Invoice Generator with an invoice date in June (anchor month). Expect total **€14,500**, with the line item "Annual Platform Fee — Minimum …".
2. Change the invoice date to a non-anchor month (e.g. September). Expect the quarterly overage branch: `max(0, max(floor, MW × rate) − YTD)`.
3. Confirm the console debug log shows `totalPrice: 14500` for the June case.

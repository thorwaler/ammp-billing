## Fix: Calculator shows 0 for per_mw_annual_upfront on quarterly preview

### Root cause

`src/lib/invoiceCalculations.ts` lines 1267–1273 (quarterly_overage branch):

```ts
const billedSoFar = Math.max(ytdInvoiced, annualFloor);
overageAmount = Math.max(0, annualModuleValue - billedSoFar);
cycleAmount = overageAmount;
```

The `Math.max(ytdInvoiced, annualFloor)` **pretends the annual floor has already been billed** even when `ytdInvoiced = 0`. For SolarX previewing a quarterly invoice with `ytd_invoiced_amount = 0`:

- `annualFloor = 14500` (fixed minimum)
- `annualModuleValue ≈ 9137` (MW × rate full-year)
- `billedSoFar = max(0, 14500) = 14500`
- `overageAmount = max(0, 9137 − 14500) = 0`
- → `totalPrice = 0`

This is the bootstrap bug: if the contract's first quarterly invoice isn't at the anchor month, the floor is never billed.

### Fix

Change the quarterly_overage block so it catches up to the floor and to YTD module value:

```ts
const targetYTD = Math.max(annualFloor, annualModuleValue);
overageAmount = Math.max(0, targetYTD - ytdInvoiced);
cycleAmount = overageAmount;
```

Behavior after the fix:

| Scenario | `ytdInvoiced` | `annualModuleValue` | `annualFloor` | Charged this Q |
|---|---|---|---|---|
| First quarterly (no floor billed yet) | 0 | 9,137 | 14,500 | **14,500** |
| Anchor-quarter already billed | 14,500 | 9,137 | 14,500 | 0 |
| Module value exceeds floor | 14,500 | 18,000 | 14,500 | 3,500 |
| Anchor-cycle billed + later overage | 16,000 | 20,000 | 14,500 | 4,000 |

Annual-cycle branch is unchanged: anchor month still charges the full `annualFloor` upfront.

The same `cycleAmount`/`overageAmount` flow into `result.totalPrice` and `result.perMWAnnualUpfrontBreakdown.overageAmount`, so the Xero line items, support doc, and dashboard all reflect the catch-up without further changes.

### Files

- `src/lib/invoiceCalculations.ts` — only the quarterly_overage block (lines 1267–1273).

### Out of scope

- The duplicate-key React warning in `UpcomingInvoicesList` (separate issue — same `contractId-date` key appearing twice because the per_mw_annual_upfront contract is being listed under two cycles). Mention only; do not fix in this turn unless the user asks.

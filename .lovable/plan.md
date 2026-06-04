## Fix: SolarX Xero invoice missing annual upfront minimum fee

### Root cause

For `per_mw_annual_upfront` contracts, `calculateInvoice` correctly overrides `result.totalPrice` to the **annual floor** (`max(fixedAnnualMinimum, committedMW × perMWpRate)`) and exposes it via `result.perMWAnnualUpfrontBreakdown` with `cycleType`, `annualFloor`, `overageAmount`, etc.

But the **Xero line-item builder** in `src/components/dashboard/InvoiceCalculator.tsx` (and the merged-invoice equivalent) always pushes raw `result.moduleCosts` (MW × rate). It never reads `perMWAnnualUpfrontBreakdown`, so:

- When `annualFloor > MW × rate` on the annual cycle → Xero shows only the smaller MW-based amount, missing the minimum fee.
- The ARR sum (line ~1266) also adds `result.moduleCosts`, so `arr_amount` is understated.
- `invoice_amount` already uses `result.totalPrice`, so the stored total is correct, which is why Xero's total differs from our internal record.

Same gap exists in `MergedInvoiceDialog.buildMergedLineItems` for merged invoices that include a per_mw_annual_upfront contract.

### Fix

In `src/components/dashboard/InvoiceCalculator.tsx`, inside the Xero line-items section:

1. **Detect** the package via `result.perMWAnnualUpfrontBreakdown` (works for both literal `per_mw_annual_upfront` and custom contract types whose `pricing_model` is `per_mw_annual_upfront`, since the calculator already sets this breakdown when the effective package type matches).

2. **Skip** the standard `result.moduleCosts.forEach(...)` push for this package (lines 994–1001) and the `result.minimumCharges` line (already covered by floor).

3. **Emit dedicated lines** from the breakdown:
   - **Annual upfront cycle** (`cycleType === 'annual_upfront'`):
     - One line: `Annual Platform Fee — Minimum (committed {committedMW} MW × {rate}/MW or fixed minimum {fixedAnnualMinimum}, whichever is higher)` with `UnitAmount = annualFloor`, account = `ACCOUNT_PLATFORM_FEES`.
     - Optionally a second informational line if you want to show the MW reading, but the amount must total `annualFloor` only — no double-billing.
   - **Quarterly overage cycle** (`cycleType === 'quarterly_overage'`):
     - If `overageAmount > 0`: one line `Per-MW Overage — Q{n} ({mw} MW × {rate}/MW, YTD adjustment)` with `UnitAmount = overageAmount`.
     - If `overageAmount === 0`: no module/overage line at all (the invoice will only contain addons/retainer if any; if everything is zero, surface a UI warning before sending — but typical case has addons).

4. **Update `arrAmount`** (line ~1266): for per_mw_annual_upfront, exclude `result.moduleCosts` and instead add `result.perMWAnnualUpfrontBreakdown.cycleType === 'annual_upfront' ? annualFloor : overageAmount`. This keeps the stored ARR consistent with the actual Xero line items and `result.totalPrice`.

5. **Mirror the same logic** in `src/components/invoices/MergedInvoiceDialog.tsx` `buildMergedLineItems()` so merged invoices including a per_mw_annual_upfront contract bill the floor/overage correctly.

### Out of scope

- No changes to `invoiceCalculations.ts` — the breakdown is already exposed.
- No DB migration.
- No change to the support-document generator unless the user reports the same discrepancy there (it reads `result.totalPrice` for the headline total, so it should be OK, but I'll verify during implementation).

### Files to touch

- `src/components/dashboard/InvoiceCalculator.tsx` — line items + ARR sum.
- `src/components/invoices/MergedInvoiceDialog.tsx` — merged line items.
- Spot-check `src/lib/supportDocumentGenerator.ts` for any module-cost-vs-floor mismatch.

### Recovery for the already-sent SolarX invoice

The plan only fixes future invoices. For the already-sent SolarX draft in Xero you'll need to either edit the draft in Xero to add the minimum-fee line, or void it and regenerate from the Invoice Creator after this fix lands. Let me know which you prefer.

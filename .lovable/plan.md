## Plan

1. Update the invoice calculator’s contract query and customer mapping to include the per-MW annual upfront floor field (`annual_minimum_fee`) alongside the already-added anchor/YTD fields.
2. Pass that floor value into `calculateInvoice` from `buildCalculationParams`, so the per-MW annual upfront branch can compute `annualFloor` correctly for quarterly previews.
3. Verify the result card uses the recalculated `result.totalPrice` from that branch and confirm the preview total matches the expected floor/overage behavior.

## Technical details

- `src/components/dashboard/InvoiceCalculator.tsx`
  - Extend the `Customer` shape with `annualMinimumFee`.
  - Add `annual_minimum_fee` to the contracts select.
  - Map `contract.annual_minimum_fee` into `selectedCustomer`.
  - Include `annualMinimumFee` in `CalculationParams` when calling `calculateInvoice`.
- No business-rule change is needed in `src/lib/invoiceCalculations.ts`; the current quarterly catch-up logic already uses `annualMinimumFee` if provided.
- After implementation, validate that a quarterly `per_mw_annual_upfront` contract with a 14.5k floor no longer shows `€0` in the calculator.
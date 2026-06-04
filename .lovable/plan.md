## Fix: Invoice Calculator shows MW × rate instead of annual floor for per_mw_annual_upfront contracts

### Root cause

The Invoice Calculator's customer/contract loader (`src/components/dashboard/InvoiceCalculator.tsx`, lines ~253–402) doesn't know that SolarX's custom contract type is `per_mw_annual_upfront`:

1. The `contracts` select (line 261) **doesn't fetch `contract_types(pricing_model)`**, **`committed_minimum_mw`**, or **`annual_billing_anchor_date`**.
2. The transform (line 343) sets `package: contract.package as PackageType` directly — for custom contract types this is `'pro'` (or similar), never `'per_mw_annual_upfront'`.
3. `buildCalculationParams` (line 812) passes `packageType: selectedCustomer.package` and never sets `committedMinimumMW` / `annualBillingAnchorDate` / `ytdInvoicedAmount`.

Consequence: `calculateInvoice` never enters the `per_mw_annual_upfront` branch, so it doesn't override `result.totalPrice` with the annual floor. The UI's total (line 2921, `result.totalPrice`) shows the raw MW × rate (9,137) instead of the 14,500 minimum.

This is the same root issue we already fixed for `UpcomingInvoicesList` and `InvoiceCalculator`'s YTD/anchor lookup at line 1400 — but only at *invoice-save* time. The *calculation/preview* path was never patched.

### Fix

**`src/components/dashboard/InvoiceCalculator.tsx`** (only file touched):

1. Add to the contracts select (line 261 block):
   - `committed_minimum_mw`
   - `annual_billing_anchor_date`
   - `ytd_invoiced_amount`
   - `contract_types ( pricing_model )`

2. In the transform (line 338 return object):
   - Override `package`: if `contract.contract_types?.pricing_model === 'per_mw_annual_upfront'`, set `package: 'per_mw_annual_upfront' as PackageType`; otherwise keep `contract.package as PackageType`.
   - Map `committedMinimumMW: Number(contract.committed_minimum_mw) ?? undefined`
   - Map `annualBillingAnchorDate: contract.annual_billing_anchor_date ?? undefined`
   - Map `ytdInvoicedAmount: Number(contract.ytd_invoiced_amount) ?? 0` (add to `Customer` interface if missing)

3. In `buildCalculationParams` (line 812 params object), pass:
   - `committedMinimumMW: selectedCustomer.committedMinimumMW`
   - `annualBillingAnchorDate: selectedCustomer.annualBillingAnchorDate`
   - `ytdInvoicedAmount: selectedCustomer.ytdInvoicedAmount`

That restores `calculateInvoice`'s `per_mw_annual_upfront` branch in the calculator preview, so `result.totalPrice` becomes `max(committedMW × rate, fixedAnnualMinimum) + addons + ...`, matching the Xero line-item and support-doc fix.

### Out of scope

- No changes to `invoiceCalculations.ts`, the support doc, the Xero builder, or other pages.
- No DB migration.

### Files

- `src/components/dashboard/InvoiceCalculator.tsx` — select fields, customer transform, params builder.

# Fix empty per_site invoice + cleanup

## 1. Recompute on Send (no stale `result`)
In `src/components/dashboard/InvoiceCalculator.tsx`, extract the `CalculationParams` build from `handleCalculate` into a shared helper `buildCalculationParams()`. Call `calculateInvoice(buildCalculationParams())` at the **start of `handleSendToXero`** and use that fresh `result` for:
- line items
- `invoice_amount`, `arr_amount`, `nrr_amount`, `modules_data`, `addons_data` on insert
- `generateSupportDocumentData(...)`

## 2. Block empty per_site sends
At the top of `handleSendToXero`, if `package === 'per_site'` and `selectedSitesToBill.length === 0`, show a destructive toast ("No sites are due for billing this period.") and abort.

## 3. Disable Send while site billing is loading
The `loadingSiteBilling` state already exists. Add `loadingSiteBilling` to the disabled condition on the Send-to-Xero button (line ~2873) and on the Calculate button. Show a small "Loading sites…" hint when relevant.

## 4. Clean up the broken invoice + site rows
Run a one-off SQL cleanup via the data tool:
- Delete invoice `f2ca26b5-a605-404c-8972-e19f79170a5d` from `invoices`
- Reset the 3 affected `site_billing_status` rows (UNHCR FO Iriba, UNHCR GH Iriba, and the third one linked to that invoice):
  - `onboarding_fee_paid = false`
  - `onboarding_fee_paid_date = null`
  - `onboarding_invoice_id = null`
  - `last_annual_invoice_id = null`
  - `last_annual_payment_date = null`
  - `next_annual_due_date = null`

User will delete the invoice in Xero manually.

## Files touched
- `src/components/dashboard/InvoiceCalculator.tsx` (refactor + guards + button states)
- One database migration/insert to perform the cleanup

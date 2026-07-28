## Problem

The Xero branding + WHT fields render in `CustomerForm`, but when opening **Edit Customer** they always show blank — and worse, saving wipes any stored values to `null`.

Root cause: the data never flows to the form on edit.

1. `src/pages/Customers.tsx` fetches customers but does not select `xero_branding_theme_id`, `wht_gross_up_rate`, `xero_tax_type` (and doesn't expose them on the mapped customer object).
2. `src/components/customers/CustomerCard.tsx` `CustomerCardProps` has no props for these fields, and the edit dialog passes only `{ id, name, nickname, location, mwpManaged, status }` into `<CustomerForm existingCustomer={...}>`.
3. `CustomerForm` therefore reads `existingCustomer?.xero_branding_theme_id` as `undefined` → inputs are blank → submit writes `null` back to the DB, silently clearing whatever was saved.

Invoice generation itself already reads the columns correctly in `xero-send-invoice` (by contact name), so once the edit path stops wiping them, invoices will pick up the theme + gross-up as intended.

## Fix

### 1. `src/pages/Customers.tsx`
- Add `xero_branding_theme_id`, `wht_gross_up_rate`, `xero_tax_type` to the customers select.
- Include them on the mapped customer object handed to `CustomerCard`.

### 2. `src/components/customers/CustomerCard.tsx`
- Extend `CustomerCardProps` with the three fields (optional).
- Destructure them in the component signature.
- Forward them into `<CustomerCard>` from `Customers.tsx`.
- Pass them into `existingCustomer` on the edit `<CustomerForm>` using DB-shaped keys (`xero_branding_theme_id`, `wht_gross_up_rate`, `xero_tax_type`, plus `manual_status_override` which is already available in scope).

### 3. `src/components/customers/CustomerForm.tsx` — safety
- No visual change needed; the fields already read `existingCustomer?.xero_branding_theme_id` and `existingCustomer?.wht_gross_up_rate`. Once the props arrive, they populate correctly.
- Optional hardening (recommended): if `existingCustomer` is provided, only include `xero_branding_theme_id` / `wht_gross_up_rate` in the update payload when the user actually touched the inputs, so any future forms that forget to pass them can't clear stored values. Simplest form: compare against the initial state snapshot and omit unchanged keys from the update object.

### 4. Verify
- Edit an existing customer that has values → fields prefilled.
- Save without changes → values preserved in DB (spot-check via a quick read query).
- Xero send path unchanged (already reads the columns).

## Out of scope
- No DB migration; columns already exist.
- No changes to `xero-send-invoice` — the lookup and gross-up are already correct.
- VAT (`xero_tax_type`) UI selector — this plan only routes the existing value through so it stops getting wiped; a proper picker can be a separate ask.

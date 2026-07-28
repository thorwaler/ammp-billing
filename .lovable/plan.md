## Goal
Enable per-customer Xero branding theme selection (so Nigerian customers use the Nigeria template) plus a per-customer withholding-tax gross-up that inflates invoice line amounts by `1 / (1 - wht_rate)` (e.g. divide by 0.9 for 10% WHT). VAT is already handled via the existing `customers.xero_tax_type` — no change there.

## Scope

### 1. Customer fields (DB)
Add two columns to `public.customers`:
- `xero_branding_theme_id text` — Xero BrandingThemeID to attach to invoices for this customer. Null = use org default.
- `wht_gross_up_rate numeric` — e.g. `0.10` for 10%. Null/0 = no gross-up. Stored as the WHT rate the customer will deduct on payment; invoice amounts get divided by `(1 - rate)`.

Migration only, no data backfill.

### 2. Customer form UI
In `src/components/customers/CustomerForm.tsx`, add a "Xero invoicing" section:
- Text input: "Xero branding theme ID" (with helper text explaining where to find it in Xero → Settings → Invoice Settings).
- Numeric input: "Withholding tax rate (%)" — displayed as percent, stored as decimal. Helper text: "Invoice amounts are grossed up so the customer's WHT deduction still nets the invoiced amount."
- Both optional; leave blank for non-WHT customers.

### 3. Invoice send: apply theme + gross-up
In `supabase/functions/xero-send-invoice/index.ts`, extend the existing customer lookup that already reads `xero_tax_type`:
- Also select `xero_branding_theme_id` and `wht_gross_up_rate`.
- If `xero_branding_theme_id` is set, add `BrandingThemeID` to the invoice payload.
- If `wht_gross_up_rate > 0`, multiply each `LineItem.UnitAmount` (and any pre-computed `LineAmount`) by `1 / (1 - rate)`, rounded to 2 decimals. Applies to all line items uniformly — user confirmed no separate WHT line.

Nothing changes for merged invoices at the caller level; the gross-up runs on the final payload inside the edge function so both single and merged flows are covered.

### 4. Support document
Add a footnote on `SupportDocument.tsx` when `wht_gross_up_rate > 0`: "Amounts grossed up by X% to offset withholding tax deducted at payment." So the internal breakdown still shows the pre-gross-up economics while the Xero invoice shows the grossed-up amounts. (Read-only display, no calc change.)

## Out of scope
- No automatic country detection — theme and WHT are per-customer overrides only, as chosen.
- No changes to VAT handling (`xero_tax_type` already covers per-line tax rates).
- No new tables; both fields live on `customers`.

## Technical notes
- Xero API: `BrandingThemeID` is a top-level field on the Invoice object. Retrieve IDs via `GET /BrandingThemes` if the user asks later; for now they paste the GUID.
- Gross-up formula: `grossed = original / (1 - wht_rate)`. For `wht_rate = 0.10`, divisor is `0.9` — matches the user's stated behaviour.
- Rounding: round each line to 2 decimals after gross-up to keep Xero totals stable.
- The existing `tax_category` column on `customers` is left alone — WHT is orthogonal.

## Files touched
- New migration: add `xero_branding_theme_id`, `wht_gross_up_rate` to `customers`.
- `src/components/customers/CustomerForm.tsx` — add the two fields.
- `supabase/functions/xero-send-invoice/index.ts` — read new fields, apply theme + gross-up.
- `src/components/invoices/SupportDocument.tsx` — footnote when WHT gross-up applies.
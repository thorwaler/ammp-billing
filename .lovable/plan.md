# Editable Xero tax settings + Xero-driven invoice due dates

## 1. Make the Nigeria customer setup fully editable

What exists today for a customer (e.g. the Nigerian one):
- Xero branding theme ID — editable in the customer form.
- Withholding tax rate (%) — editable in the customer form.
- Xero tax type (VAT / AccountsReceivableTaxType) — **not editable**. It is only written by the Xero customer sync from the contact's default sales tax, and silently applied to every invoice line at send time.

Change: add a "Xero tax type" field to the customer form's "Xero invoicing" block so it can be set or corrected manually.

- Free-text input with helper text (Xero tax type codes vary per organisation, e.g. `OUTPUT`, `NONE`, `EXEMPTOUTPUT`), pre-filled with the currently synced value.
- Note under the field that leaving it blank means Xero's own contact default is used.
- Saving writes `xero_tax_type` on the customer.
- The customer card gets the same treatment it already gives WHT/branding: show the tax type when set, so it is visible without opening the form.

Caveat worth flagging: the nightly Xero customer sync currently overwrites `xero_tax_type` with the value from Xero. To keep a manual edit from being wiped, the sync will only fill this field when it is empty, leaving any manually entered value alone.

## 2. Invoice due dates from the customer's Xero terms

Today both the single-invoice calculator and the merged-invoice dialog hardcode `DueDate = invoice date + 30 days`.

Change: use the customer's default payment terms from Xero instead.

- The Xero customer sync will also store each contact's sales payment terms (number of days + term type, e.g. "of the following month" vs "days after invoice date").
- At invoice send time the due date is computed from those terms against the invoice date.
- If a customer has no terms set in Xero, the invoice is sent without an explicit due date so Xero applies its own organisation default; the previous hardcoded +30 days is dropped.
- Customers already synced will get their terms on the next customer sync; a note in the customer form explains that the due date follows Xero.

This changes only the due date sent to Xero. It does not change the internal "create by" / invoice-due notifications, which stay driven by `next_invoice_date` and the per-contract lead days.

## Technical notes

- `src/components/customers/CustomerForm.tsx`: add `xeroTaxType` to form state and the Xero invoicing card; include `xero_tax_type` in the insert/update payload.
- `src/components/customers/CustomerCard.tsx`: surface the tax type alongside the existing WHT/branding indicators.
- Migration: add `xero_payment_terms_days integer` and `xero_payment_terms_type text` to `public.customers` (nullable, no grant changes needed — existing table).
- `supabase/functions/xero-sync-customers/index.ts`: map `contact.PaymentTerms?.Sales` into the two new columns; change `xero_tax_type` write to only set when the local value is null.
- `supabase/functions/xero-send-invoice/index.ts`: extend the customer lookup to the new terms columns, compute `DueDate` from `Day` + `Type` (`DAYSAFTERBILLDATE`, `OFCURRENTMONTH`, `DAYSAFTERBILLMONTH`, `OFFOLLOWINGMONTH`), and delete `DueDate` from the payload when no terms exist.
- `src/components/dashboard/InvoiceCalculator.tsx` (line ~1476) and `src/components/invoices/MergedInvoiceDialog.tsx` (line ~592): remove the hardcoded `DueDate`, letting the edge function set it.

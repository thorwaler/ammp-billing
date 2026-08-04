# Editable Xero tax settings + Xero-driven invoice due dates

## 1. Make the Nigeria customer setup findable and fully editable

Where those fields live today: they are only inside the "Edit Customer" dialog, reached from the three-dot menu on a customer card on the Customers page. I opened that dialog in the running app and both fields are there — "Xero branding theme ID" and "Withholding tax rate (%)", inside an "Xero invoicing" box near the bottom. The "Details" button on a customer card does **not** go to a customer page; it jumps straight to the contract page, which is likely where the settings were being looked for.

So there are two problems: discoverability, and one setting that genuinely cannot be edited.

Changes:

- Add an "Xero invoicing" summary to the customer card itself, showing branding theme set / WHT rate / tax type at a glance, with an "Edit" affordance that opens the same customer dialog — no more hunting in the three-dot menu.
- Add an "Edit customer" entry point on the contract details page (header area, next to the customer name), opening the same customer form, so the settings are reachable from where the "Details" button lands.
- Add the missing field: "Xero tax type" (the VAT / AccountsReceivableTaxType applied to every invoice line). Today it is written only by the Xero customer sync and cannot be changed in the app. It becomes a text input in the Xero invoicing block, pre-filled with the synced value, with helper text that codes vary per Xero organisation (e.g. `OUTPUT`, `NONE`, `EXEMPTOUTPUT`) and that blank means Xero's own contact default is used.

Caveat worth flagging: the Xero customer sync currently overwrites `xero_tax_type` with the value from Xero. To keep a manual edit from being wiped, the sync will only fill this field when it is empty, leaving any manually entered value alone.


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
- `src/components/customers/CustomerCard.tsx`: add a compact Xero invoicing summary row (branding theme / WHT / tax type) with an inline Edit trigger reusing the existing `CustomerForm` dialog; pass `xero_tax_type` through.
- `src/pages/ContractDetails.tsx`: add an "Edit customer" button that opens `CustomerForm` for the contract's customer (fetch the customer row's Xero fields alongside the contract).
- Migration: add `xero_payment_terms_days integer` and `xero_payment_terms_type text` to `public.customers` (nullable, no grant changes needed — existing table).
- `supabase/functions/xero-sync-customers/index.ts`: map `contact.PaymentTerms?.Sales` into the two new columns; change `xero_tax_type` write to only set when the local value is null.
- `supabase/functions/xero-send-invoice/index.ts`: extend the customer lookup to the new terms columns, compute `DueDate` from `Day` + `Type` (`DAYSAFTERBILLDATE`, `OFCURRENTMONTH`, `DAYSAFTERBILLMONTH`, `OFFOLLOWINGMONTH`), and delete `DueDate` from the payload when no terms exist.
- `src/components/dashboard/InvoiceCalculator.tsx` (line ~1476) and `src/components/invoices/MergedInvoiceDialog.tsx` (line ~592): remove the hardcoded `DueDate`, letting the edge function set it.

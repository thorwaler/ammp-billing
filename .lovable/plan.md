## Goal

Make the invoice creation lead-time feature usable across the app:
1. Edit/create flow exposes the lead-days field for **all** packages (currently hidden for Elum ePM and Jubaili).
2. Upcoming Invoices list shows **all** active contracts always; lead days drive when each contract appears in sort order and a "Create by" date is shown on the card.

## Fixes

### 1. `ContractForm.tsx` — make the field universal

The block at line 1953 hides `invoicingType` + `invoiceLeadDays` whenever the package is `elum_epm` or `elum_jubaili` (those packages render their own dedicated billing section above). Lift both `FormField`s out of that conditional into a small "Invoicing" group rendered for every non-POC package, so ePM, Jubaili, Portfolio OS, Internal, Pro, Custom, etc. all expose the field.

Behavior unchanged: the four package `onChange` handlers (lines 707/715/724/729) still default `invoiceLeadDays` to 45 when an Elum package is selected; other packages default to 0.

### 2. `UpcomingInvoicesList.tsx` — drop filter, sort by create-by date

- Remove the `visibleInvoices` filter entirely. Every active contract with a `next_invoice_date` appears.
- Compute `createByDate = nextInvoiceDate − invoiceLeadDays` (falls back to `nextInvoiceDate` when leadDays = 0).
- **Sort the list (and the customer groups) by `createByDate` ascending**, so contracts that need to be prepared soonest bubble to the top — Elum quarterly contracts with 45-day lead surface ~6 weeks before their actual end-of-quarter invoice date.
- Continue passing `invoiceLeadDays` through to the card.

### 3. `CustomerInvoiceGroup.tsx` / invoice card — show "Create by" date

When `invoiceLeadDays > 0`, render a small secondary line / badge: **"Create by {createByDate}"**. The actual invoice date stays the primary date on the card.

### 4. No data backfill, no migration

Existing 45-day defaults for Elum stay as-is. The user adjusts per contract via the now-visible form field.

## Out of scope

Invoice generation, period math, Skip / Mark-as-Sent, and Xero sync — none of these read `invoice_lead_days`.

## Files touched

- `src/components/contracts/ContractForm.tsx`
- `src/components/invoices/UpcomingInvoicesList.tsx`
- `src/components/invoices/CustomerInvoiceGroup.tsx`
- `mem://features/invoice-creation-lead-time.md` (clarify: lead days are display + sort key; contracts always visible)

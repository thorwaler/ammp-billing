## Goal
Allow Elum (and any other) contracts to surface in **Upcoming Invoices** earlier than their actual `next_invoice_date`, without changing the invoice/period dates themselves. The invoice still carries the end-of-quarter date — only its visibility window shifts forward.

## Approach
Add a configurable **invoice creation lead time** (in days) to each contract. When set, the invoice appears in the upcoming list as soon as `today >= next_invoice_date - lead_days`. Defaults to `45` for Elum packages (ePM, Jubaili, Portfolio OS, Elum Internal), `0` for everything else.

## Changes

### 1. Database
- Add column `invoice_lead_days INTEGER DEFAULT 0` to `contracts`.
- Backfill existing Elum contracts (`package` in elum variants) to `45`.

### 2. Contract form (`ContractForm.tsx`)
- New numeric input "Invoice creation lead time (days)" in the billing section.
- Helper text: "Show this invoice in Upcoming Invoices N days before the invoice date. The invoice itself still carries the next invoice date."
- Default value pre-filled to `45` when an Elum package is selected on a new contract.

### 3. Upcoming Invoices list (`UpcomingInvoicesList.tsx`)
- Select `invoice_lead_days` in the contracts query and pass it through `UpcomingInvoice`.
- Today contracts only show when `next_invoice_date <= now`. After this change: include contracts where `next_invoice_date - lead_days <= now`.
- Add a small badge on early-surfaced cards: e.g. "Early — invoice dated {nextInvoiceDate}", so the user knows the actual date is later.
- Auto-advance logic for `automated` contracts must still trigger only on the real `next_invoice_date`, not the early window.

### 4. Display
- `CustomerInvoiceGroup` / card header: when `lead_days > 0` and `now < next_invoice_date`, show subtle muted text "Invoice date: {date}" plus the existing date.

## Out of scope
- No change to invoice generation logic, period dates, or Xero sync — only the visibility window and an informational badge.
- No change to "Skip" or "Mark as Sent" math — both still pivot on `next_invoice_date`.

## Technical notes
- Field name in DB: `invoice_lead_days` (int, not null, default 0).
- Type regen will pick it up automatically.
- Memory: add a small note under "Billing & Invoicing" describing the lead-time concept.

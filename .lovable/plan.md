## Goal

Stop the system from auto-defaulting `invoiceLeadDays` to 45 when an Elum package is picked. Instead, set 45 once on all existing Elum contracts in the database, then leave the field fully user-controlled going forward.

## Changes

### 1. `ContractForm.tsx` — remove the package-driven default

Delete the four `if (!form.getValues("invoiceLeadDays")) form.setValue("invoiceLeadDays", 45)` lines (lines 713, 719, 724, 729) inside the `elum_epm`, `elum_jubaili`, `elum_portfolio_os`, and `elum_internal` package `onChange` branches.

After this, picking an Elum package no longer touches `invoiceLeadDays`. The field shows whatever the contract already has (or 0 for brand-new contracts), and the user edits it freely.

### 2. One-time data backfill

Update every existing contract whose `package` starts with `elum_` and currently has `invoice_lead_days = 0` to `invoice_lead_days = 45`. Contracts already customized away from 0 are left alone.

```sql
UPDATE public.contracts
SET invoice_lead_days = 45
WHERE package IN ('elum_epm','elum_jubaili','elum_portfolio_os','elum_internal')
  AND COALESCE(invoice_lead_days, 0) = 0;
```

Run via the data-insert tool (not a migration — this is a data update, not a schema change).

### 3. No other changes

- Form field stays visible for all non-POC packages (already done).
- Upcoming Invoices list / sort / "Create by" badge already read whatever value is stored — no change needed.
- No migration, no schema change.

## Files touched

- `src/components/contracts/ContractForm.tsx` (delete 4 lines)
- One data-update SQL run against `contracts`
- `mem://features/invoice-creation-lead-time.md` (note: 45 is a one-time backfill for Elum, not an auto-default)

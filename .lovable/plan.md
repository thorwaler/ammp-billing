## Cleanup found

Three small things from today's lead-days work are worth tidying. Nothing functional is broken.

### 1. Drop `as any` casts on `invoice_lead_days`

The generated Supabase types now include `invoice_lead_days` on the `contracts` row, so the casts written before the type was generated are no longer needed.

- `src/pages/ContractDetails.tsx:550` — `(contract as any).invoice_lead_days ?? 0` → `contract.invoice_lead_days ?? 0`
- `src/pages/ContractDetails.tsx:631` — same change
- `src/components/invoices/UpcomingInvoicesList.tsx:221` — `Number((c as any).invoice_lead_days) || 0` → `c.invoice_lead_days ?? 0`

### 2. Replace `|| 0` with `?? 0` on numeric mappings

Project Core rule: "Use `??` or explicit `!= null` instead of `||` to map numeric fields, preserving valid `0` values." Lead days are an int where `0` is a real value, so `||` is technically equivalent but inconsistent with the rule.

- `src/components/invoices/UpcomingInvoicesList.tsx:221` (covered above)
- `src/components/invoices/UpcomingInvoicesList.tsx:388` — `c.invoiceLeadDays || 0` → `c.invoiceLeadDays ?? 0`
- `src/components/invoices/UpcomingInvoicesList.tsx:625` — `c.invoiceLeadDays || 0` → `c.invoiceLeadDays ?? 0`
- `src/components/invoices/CustomerInvoiceGroup.tsx:63` — `c.invoiceLeadDays || 0` → `c.invoiceLeadDays ?? 0`

### 3. Update the lead-time memory file

`mem://features/invoice-creation-lead-time.md` line 10 still reads "Default seeded to 45 days for Elum packages…" which implies an ongoing auto-default. After today's change the form no longer sets 45 when an Elum package is picked — 45 was applied once via a backfill and is fully user-editable thereafter. Reword to something like:

> One-time backfill set `invoice_lead_days = 45` on existing Elum contracts (`elum_epm`, `elum_jubaili`, `elum_portfolio_os`, `elum_internal`). The form does not auto-default this value for any package; new contracts start at 0 and users edit freely.

Also update the index entry (`mem://index.md`) to drop the "default 45 for Elum" wording for the same reason.

## Out of scope (intentionally not touching)

- The migration file `supabase/migrations/20260512122958_*.sql` — it adds the column and applies the same Elum→45 backfill. It's idempotent (`IF NOT EXISTS`, `WHERE invoice_lead_days = 0 AND package IN (...)`) and matches today's desired DB state, so leaving it as-is.
- Form schema, sort logic, "Create by" badge — all working as intended.
- `e.target.valueAsNumber || 0` in the form input — guards against NaN, not a value mapping.

## Files touched

- `src/pages/ContractDetails.tsx`
- `src/components/invoices/UpcomingInvoicesList.tsx`
- `src/components/invoices/CustomerInvoiceGroup.tsx`
- `mem://features/invoice-creation-lead-time.md`
- `mem://index.md`

## Goal

Notify users when an invoice needs to be sent, using each contract's **create-by date** (= `next_invoice_date` − `invoice_lead_days`). For Elum contracts with a 45-day lead, that's the early date already shown in the Upcoming Invoices list; for everything else, the lead is 0 so it's the invoice date itself.

Three notification states per contract per billing period:

1. **Heads-up** (info) — 3 days before create-by date
2. **Due today** (warning) — on the create-by date
3. **Overdue** (warning) — after the create-by date has passed

Each state fires at most once per contract per billing period (deduplicated by `contract_id` + `next_invoice_date` stored in `metadata`).

## Scope

- Only contracts where `contract_status = 'active'` and `invoicing_type` in (`'standard'`, `'manual'`) — skip `'automated'` (Xero-managed).
- Skip contracts with no `next_invoice_date`.

## Implementation

### 1. New util: `src/utils/invoiceDueNotifications.ts`

Mirrors `contractExpiration.ts`:

- `checkInvoiceDueStatus(nextInvoiceDate, leadDays)` → returns `{ state: 'heads_up' | 'due' | 'overdue' | 'none', createByDate, daysUntilCreateBy }`. All date math in CET via `parseDateCET` (per Core memory rule).
- `checkAllInvoiceDueDates(userId)` → fetches eligible contracts, computes state per contract, dedupes against existing notifications of the same `type` whose `metadata->>next_invoice_date` matches the current period, then inserts new notifications via `supabase.from('notifications').insert(...)`.

Notification shape:
```
type:     'invoice_due_soon' | 'invoice_due_today' | 'invoice_overdue'
title:    e.g. "Invoice Due Soon" / "Invoice Due Today" / "Invoice Overdue"
message:  `Invoice for "<contract or company name>" should be created by <create-by date> (invoice date <next_invoice_date>).`
severity: 'info' for heads_up, 'warning' for due/overdue
contract_id, metadata: { next_invoice_date, create_by_date, lead_days, days_until_create_by, company_name, contract_name }
```

### 2. Trigger from `src/pages/Index.tsx`

Add `checkAllInvoiceDueDates(user.id)` alongside the existing `checkAllContractExpirations(user.id)` call (line ~103). Same fire-and-forget pattern with `.catch(err => console.error(...))`.

### 3. Webhook notification types

Append the three new types to:

- `src/components/integrations/WebhookNotifications.tsx` — the `NOTIFICATION_TYPES` list (grouped under "Invoice") and the default `notification_types` array (two places, lines 18, 60, 87).
- Default array in DB column `notification_settings.notification_types` — **no migration needed**; existing users will see the new toggles default-on only for newly-created settings. Existing rows keep their current list and can opt in via the UI.

### 4. NotificationItem icon/color (optional polish)

`src/components/notifications/NotificationItem.tsx` — add a case for the new `invoice_due_*` types (e.g. `FileText` icon). Falls back to default rendering if skipped.

## Out of scope

- No new DB columns or migration. Reuses existing `notifications` table and `metadata` JSONB for dedup keys.
- No scheduled edge function — runs on app load like the existing expiration check. (Can be promoted to a cron job later if needed.)
- No changes to the Upcoming Invoices UI itself.

## Files touched

- **new** `src/utils/invoiceDueNotifications.ts`
- `src/pages/Index.tsx` (1 import + 1 call)
- `src/components/integrations/WebhookNotifications.tsx` (add 3 type entries + defaults)
- `src/components/notifications/NotificationItem.tsx` (icon mapping)
- `mem://features/invoice-due-notifications.md` + `mem://index.md` (record the new behavior)

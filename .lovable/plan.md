
Goal:
Do a follow-up pass so the new shared/team-edit model is applied consistently, and remove remaining owner-scoped assumptions that can still break preview-mode workflows.

What should also be updated

1. Fix remaining UI mutations that still require row ownership
These still use `.eq('user_id', user.id)` on updates and will fail for non-owner managers/admins even though RLS now allows shared writes:
- `src/components/customers/CustomerCard.tsx`
  - customer activate/inactivate
  - cascade contract expiry update
- `src/pages/ContractDetails.tsx`
  - contract status change
These should update by row identity/business key only, not current owner.

2. Fix remaining shared reads that are still artificially owner-filtered
These can make shared users see empty state or miss data even when SELECT RLS is already team-wide:
- `src/components/dashboard/InvoiceCalculator.tsx`
  - site billing fetch still filters `site_billing_status` by `user_id`
- `src/hooks/useNotifications.ts`
  - fetches only notifications where `user_id = current user`
  - `markAllAsRead` also only affects current-user notifications
If notifications are intended to be team-shared, remove the owner filter. If they are intended to remain personal, keep as-is and document that explicitly.

3. Refactor AMMP backend follow-ons to match the new shared integration model
Two backend functions still assume “connection owner = sync owner”:
- `supabase/functions/ammp-device-enrichment/index.ts`
  - fetches AMMP connection with `.eq('user_id', contract.user_id)`
- `supabase/functions/ammp-scheduled-sync/index.ts`
  - fetches contracts with `.eq('user_id', user_id)` based on connection owner
This is the biggest remaining architectural inconsistency. They should use the same shared-connection/team-authorization approach now used in `ammp-sync-contract`.

4. Review old client-side AMMP helper paths
`src/services/ammp/ammpService.ts` still queries active contracts with:
- `.eq('customer_id', customerId)`
- `.eq('user_id', userId)`
That helper is marked as legacy/backwards compatibility, but if it is still used anywhere later, it will reintroduce owner-scoped behavior. Best cleanup:
- either remove dead shared-access-incompatible helpers
- or refactor them to shared/team semantics before reuse becomes a bug

5. Decide which “settings” are team-shared vs user-personal, then align code + RLS
Current behavior is mixed:
- Shared already: `xero_connections`, `ammp_connections`, `notification_settings`, `sharepoint_*`
- Still owner-personal by policy/design: `alert_settings`, `currency_settings`
Before refactoring further, confirm intended scope for:
- `notifications`
- `alert_settings`
- `currency_settings`
- `contract expiration notifications`
If any of these should become team-shared, both frontend queries and RLS should be updated together.

Recommended refactor themes

A. Introduce a clear convention
Use these rules consistently:
- shared team resources: query by `id`, `limit(1)`, or business key only
- personal resources: query by `auth user id`
- updates to shared rows: never send or filter on `user_id` unless creating a new audit owner
This avoids repeating one-off fixes.

B. Centralize shared integration lookups
Create/reuse small helpers for:
- “get shared AMMP connection”
- “get shared Xero connection”
- “authorize manager/admin team write”
Then use those helpers across edge functions so future fixes happen in one place.

C. Separate audit ownership from authorization
Right now `user_id` serves two meanings:
- who created/configured the row
- who is allowed to mutate it
The recent bugs came from conflating those. Keep `user_id` for audit, but never use it as the auth gate for team-shared data.

Priority order
1. `ammp-device-enrichment`
2. `ammp-scheduled-sync`
3. `CustomerCard` + `ContractDetails` owner-filtered updates
4. `InvoiceCalculator` site billing owner-filtered read
5. optional cleanup of legacy AMMP helper/service code
6. explicit product decision on notifications/settings scope

Expected result
- Shared users won’t hit hidden owner-based failures in adjacent AMMP flows.
- Team-editing behaves consistently across contract/customer status changes.
- Shared integrations follow one architecture instead of mixing owner-based and team-based access.
- Future bugs become less likely because shared-vs-personal data rules are explicit.

Technical details
Remaining concrete owner-scoped blockers found:
- `src/components/customers/CustomerCard.tsx`
- `src/pages/ContractDetails.tsx`
- `src/components/dashboard/InvoiceCalculator.tsx`
- `supabase/functions/ammp-device-enrichment/index.ts`
- `supabase/functions/ammp-scheduled-sync/index.ts`
Potentially intentional/personal scope, but should be reviewed:
- `src/hooks/useNotifications.ts`
- `src/utils/contractExpiration.ts`
- `src/contexts/CurrencyContext.tsx`
- `src/hooks/useAlertSettings.ts`

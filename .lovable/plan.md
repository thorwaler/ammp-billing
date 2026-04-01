
Goal:
Confirm whether AMMP contract refresh can still fail for shared/preview users because of ownership-based access, and identify the exact blocker.

Answer:
Yes — AMMP refresh can still be affected, but the main blocker is not the relaxed `contracts/customers/invoices` UPDATE policies anymore. The bigger issue is the AMMP sync backend function still treating the sync as owner-scoped.

What I found:
1. The contract refresh button calls the backend function directly
- In `src/pages/ContractDetails.tsx`, `handleRefreshAssets()` invokes:
  - `supabase.functions.invoke('ammp-sync-contract', { body: { contractId: contract.id } })`
- So any “Refresh failed” error here depends on the backend function path, not just the page query.

2. The AMMP sync function still fetches the contract as if only the owner can run it
- In `supabase/functions/ammp-sync-contract/index.ts`, it loads the contract with:
  - `.eq('id', contractId)`
  - `.eq('user_id', effectiveUserId)`
- That means if another manager/admin tries to sync a contract owned by someone else, the function won’t find the contract and will fail before sync even starts.

3. The AMMP sync function also fetches the AMMP connection by owner user id
- Same function queries `ammp_connections` with:
  - `.eq('user_id', effectiveUserId)`
- But your app architecture says AMMP is a shared team integration, so this can also fail for non-owner managers even if they should be allowed to use the shared connection.

4. Some downstream writes are likely still owner-based too
- The sync function writes to:
  - `asset_status_history`
  - `site_billing_status`
  - `invoice_alerts`
  - `notifications`
  - `customers`
  - `contracts`
- `contracts` and `customers` are already relaxed for updates.
- But `site_billing_status`, `asset_status_history`, `invoice_alerts`, and `notifications` still have owner-based insert/update rules in your current RLS snapshot.
- Because this function uses the service-role client, those table policies may not block the function itself, but they would still block any browser-side AMMP-related follow-up logic elsewhere.
- The immediate preview-mode contract refresh failure is most likely the owner-filtered contract/connection lookup inside the function.

Plan:
1. Fix `ammp-sync-contract` ownership assumptions
- Remove owner-only lookup on the contract:
  - stop requiring `.eq('user_id', effectiveUserId)` when fetching the contract
- Load the contract by `id` only, then do an explicit authorization check:
  - user must be authenticated
  - user must have manager/admin write access via the same team-write logic already used elsewhere

2. Make AMMP connection lookup team-shared
- Change the function so it does not require the current acting user to own the `ammp_connections` row.
- Fetch the active/shared AMMP connection using team-wide access semantics instead of `user_id = effectiveUserId`.

3. Review downstream AMMP-related tables for consistency
- Re-check whether these should also support shared team writes from the browser or other functions:
  - `site_billing_status`
  - `asset_status_history`
  - `invoice_alerts`
  - `notifications`
  - `ammp_sync_jobs`
- If browser-based manager actions need to mutate them, align their RLS with the shared-edit model while preventing owner reassignment where relevant.

4. Re-test the affected flow specifically
- Re-test AMMP refresh on the failing contracts (Bidvest and Daisy) using a non-owner manager/admin.
- Confirm:
  - contract loads in the function
  - AMMP connection resolves
  - cached capabilities update
  - customer MW aggregate updates
  - no downstream insert/update fails

Expected result:
- Any manager/admin in preview mode can refresh AMMP data on a contract, even if they are not the original owner.
- Shared AMMP connection usage works consistently across the team.
- Contract asset refresh should stop failing for shared users on Bidvest and Daisy, unless there is a separate AMMP/API data issue.

Technical details:
- Current likely failure point in `ammp-sync-contract`:
  - contract fetch is filtered by `user_id = effectiveUserId`
  - AMMP connection fetch is filtered by `user_id = effectiveUserId`
- Since the function already uses a backend-level client, the correct fix is:
  - authorize by role/team membership
  - stop scoping shared resources by owner id
- This is separate from the earlier `contracts/customers/invoices` UPDATE-policy fix.

# Remove the "sibling asset group" warning for good

## What is happening

The Elum 2026 tier contracts (C&I Pro, C&I Lite, Utility, Internal) resolve their sites from AMMP feature flags, not from asset groups. But some of them still carry an old asset-group reference from before that switch:

- C&I Pro -> `[Tier] Pro` group `bb2fa819-...`
- C&I Lite -> `[Tier] Lite` group `d1ac54d1-...`

Those two groups no longer exist in AMMP. During a sync, the coverage check reads each sibling tier's asset group, gets a 404 for these two, and flags the affected sub-orgs with "Partially verified — a sibling tier's asset group no longer exists". The pricing is unaffected; it is purely a stale-pointer warning.

## Fix

1. **Clear the stale references** on the active Elum 2026 tier contracts that no longer use asset groups (C&I Pro, C&I Lite). Their billable scope comes from feature flags, so the group fields are dead data. Expired ePM contracts keep theirs for history but are excluded from the sibling scan (see 3).
2. **Self-heal during sync**: when a sibling group returns 404, the sync clears that contract's `ammp_asset_group_id` / `ammp_asset_group_name` instead of only logging "should be cleared", so the warning cannot reappear if another group is deleted later.
3. **Don't degrade coverage for a permanently missing group**: a 404 is a definitive answer (the group has no members), not incomplete data. Stop setting `siblingIncomplete` in that case — keep it only for genuine lookup failures (network/5xx). Skip non-active sibling contracts in the scan as well.
4. **UI**: the "Partially verified — a sibling tier's asset group no longer exists" note in the org-resolution panel then stops appearing; keep the label for the real-failure case only.

## Technical details

- `supabase/functions/ammp-sync-contract/index.ts`, sibling loop (~lines 745-781): on `e.groupNotFound`, issue a service-role update nulling that sibling's group fields, treat it as an empty group, and do not set `siblingLookupIncomplete`. Add `.eq('contract_status', 'active')` to the sibling select.
- Data cleanup for the two current stale rows via a data update (not a schema migration).
- `src/pages/ContractDetails.tsx` (~line 1713): unchanged logic, only reachable now for real lookup failures.

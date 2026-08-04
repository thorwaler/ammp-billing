# Fix inflated "Unassigned Assets" count on Elum sync

## What the data shows

On all three Elum 2026 contracts (Lite, Pro, Internal) the flag-less sub-org list contains an org literally named **Unassigned Assets** with **3,794 assets**, of which 3,789 are reported as "not covered". The 18 flag-less orgs together add up to 3,974 assets — exactly the size of the *entire* global asset list the sync fetches at the start of a run. AMMP itself only shows 8 assets in that org.

Cause (to be confirmed in step 1): flag-less sub-orgs are counted by filtering the global `/assets` response on `a.org_id === org.orgId`, unlike tier sub-orgs, which are resolved through the org-scoped endpoint `/v1/assets?org_ids=<id>`. The `org_id` on the global list appears to point at a catch-all/root org rather than the real owning sub-org, so almost every asset in the account lands in the "Unassigned Assets" bucket and is then reported as uncovered leakage.

## Plan

1. **Confirm the source of the discrepancy.** During a sync, log both numbers for each flag-less org: the global-list filter count and the count returned by the org-scoped endpoint. If the org-scoped call returns 8 for "Unassigned Assets", the global-list `org_id` is the culprit and step 2 applies.

2. **Resolve flag-less sub-orgs the same way as tier sub-orgs.** Use the org-scoped assets endpoint for each flag-less org instead of filtering the global list. Reuse the existing time-budget guard: when the budget is exhausted, stop resolving and mark the remaining entries `partial: true` (coverage not verified) rather than falling back to the global list, which is what produces the wrong numbers today.

3. **Cap the damage in the alert and UI.** The `elum_org_unassigned` alert and the Org resolution panel keep showing counts, but partial entries are excluded from the "not covered" totals so a truncated run can never raise a false leakage alarm.

4. **Re-sync C&I Lite** and confirm the panel shows a realistic count for "Unassigned Assets" (single digits) and an uncovered count that matches.

## Technical details

- `supabase/functions/ammp-sync-contract/index.ts`
  - Lines ~572-582: replace the `allAssets.filter(a.org_id === o.orgId)` initial count with a deferred resolution — build the flag-less org list first (ids/names only), then resolve asset lists in the coverage block via `getAssetsForOrg(token, o.orgId)`, guarded by `discoveryBudgetExceeded()`.
  - Line ~725: the coverage pass uses that resolved list instead of re-filtering `allAssets`.
  - Keep a per-org `source` marker (`org-scoped` vs `unresolved`) in `UnassignedOrgEntry` so the UI can tell the difference.
  - Add the comparison log line from step 1 permanently at debug level; it makes future drift traceable.
- `src/pages/ContractDetails.tsx`: flag-less org lines with `partial`/unresolved status render "coverage not verified" and are excluded from the header's uncovered total.

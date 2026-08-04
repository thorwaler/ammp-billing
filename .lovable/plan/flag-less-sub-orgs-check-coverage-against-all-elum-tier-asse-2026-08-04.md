# Flag-less sub-orgs: check coverage against all Elum tier asset groups

Today the coverage check for sub-orgs without a tier feature flag only compares their assets against **this contract's own** legacy asset group. So when a C&I Pro sync runs, an asset that is already priced through the **Lite** asset group looks uncovered and gets flagged, and vice versa.

## Change

An asset from a flag-less sub-org is only reported as **not covered** when it is in *none* of the Elum 2026 legacy asset groups (Lite, Pro, and any other tier contract that has one).

Coverage buckets become:

- **Covered (standard)** — in this contract's legacy group, base rate
- **Covered (eConf)** — in this contract's legacy group + AND group
- **Covered elsewhere** — in another tier's legacy asset group (e.g. Pro sync sees it in the Lite group), named so it is clear where it is billed
- **Not covered** — in no tier org and no legacy group of any tier: real leakage

The `elum_org_unassigned` alert only escalates when the "not covered" count is above zero; assets covered elsewhere are shown as context, not as a problem.

## Technical details

All changes in `supabase/functions/ammp-sync-contract/index.ts`, plus display in `src/pages/ContractDetails.tsx`.

- Before the coverage pass, load the sibling Elum tier contracts: `contracts` rows with the same `elum_parent_org_id`, `elum_tier` not null, `id <> contract.id`, selecting `contract_name`, `elum_tier`, `ammp_asset_group_id`. One database read, no extra AMMP call for the list itself.
- For each distinct sibling `ammp_asset_group_id` not already fetched, call `getAssetGroupMembers` once and cache the id set in a `Map<groupId, Set<assetId>>` shared with the existing legacy resolution (so this contract's own group is not fetched twice). Skip these calls when `discoveryBudgetExceeded()` is true and mark the coverage entry `partial: true` rather than reporting false leakage.
- Extend the classification in the unassigned-org loop: after the existing own-group checks, test the sibling sets; on a hit, increment `coveredElsewhere` and record `{ assetId, assetName, tierName }` (capped at 20 entries, same as uncovered).
- Extend the `UnassignedOrgEntry` type with `coveredElsewhere: number` and `coveredElsewhereAssets?: Array<{ assetId; assetName; tierName }>`.
- `createElumSyncAlerts`: include the covered-elsewhere total in the description; severity logic stays keyed on `uncovered > 0` only.
- `ContractDetails.tsx`: in the Org resolution panel, each flag-less sub-org line gains a "N covered by <tier> group" segment, with the tier names listed; uncovered stays the highlighted number.

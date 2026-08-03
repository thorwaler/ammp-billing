# Legacy coverage check for flag-less Elum sub-orgs

Today the sync reports sub-orgs with no tier feature flag (`epm_lite` / `epm_pro` / `epm_utility` / `elum_internal`) as a flat "stranded assets" count. It does not say whether those assets are actually still being priced through the legacy asset group. So a sub-org can look stranded while all of its sites are already billed via the legacy group — and a genuinely uncovered site is hard to spot.

## What to add

For every flag-less sub-org, classify each of its assets against the legacy asset group resolution of the same contract:

- **Covered (standard)** — asset is a legacy group member priced at the base tier rate
- **Covered (eConf)** — asset is a legacy group member in the AND group
- **Excluded** — asset is in the NOT group, so intentionally not billed
- **Not covered** — asset belongs to no tier org and no legacy group: real revenue leakage

Then surface it in three places:

1. **Contract page** — extend the existing "Org resolution" panel: each unassigned sub-org gets a line like `Acme Solar — 12 assets: 9 covered by legacy group, 1 excluded, 2 not covered (0.8 MWp)`, with uncovered rows highlighted.
2. **Alert** — the existing `elum_org_unassigned` alert changes from "N sub-orgs without a tier flag" to lead with the uncovered number: it only escalates to warning severity when there is at least one uncovered asset; when everything is covered by the legacy group it stays informational.
3. **Sync summary** — one log line with the coverage totals so the numbers can be traced in function logs.

## Technical details

All changes are in `supabase/functions/ammp-sync-contract/index.ts` plus a display change in `src/pages/ContractDetails.tsx`.

- Move the `unassignedOrgs` computation (currently at the top of the Elum branch, before the legacy split) so the coverage pass runs **after** the legacy asset group block, where the member list, `econfIds` and `excludedIds` sets already exist. Keep the initial list of flag-less orgs where it is; only enrich it later.
- Hoist `members`, `econfIds` and `excludedIds` to the enclosing scope (currently block-local) so the coverage pass can read them. When the contract has no `ammp_asset_group_id`, they are empty and every unassigned asset falls into "not covered".
- For each unassigned org, take its assets from the already-fetched `allAssets` (`a.org_id === org.orgId`) — no extra AMMP calls, so no impact on the 110s request budget — and bucket each asset id against the legacy sets and `assetOrgMap`.
- Extend the `CachedCapabilities.unassignedOrgs` type with `coveredStandard`, `coveredEconf`, `excluded`, `uncovered` counts, `uncoveredMW`, and a capped list (first 20) of `{ assetId, assetName, mw }` for the uncovered assets so the UI can name them.
- Skip the coverage pass when `resolutionTruncated` is true, and mark the entry `partial: true` so a time-budget-truncated run does not report false leakage.
- `createElumSyncAlerts`: compute totals across unassigned orgs; severity `warning` when `uncovered > 0`, otherwise `info`. Include the per-org breakdown in the alert metadata.
- `ContractDetails.tsx`: render the per-org coverage breakdown inside the existing unassigned-orgs block of the Org resolution panel, listing uncovered asset names when present.

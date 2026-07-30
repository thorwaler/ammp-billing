## What I checked

From the last sync of the C&I Lite contract (logs + cached data):

- `Elum ci_lite: 40 orgs (98 sub-orgs, 19 unassigned)`
- `Legacy asset group merged: 73 members -> 64 standard, 2 eConf, 0 excluded, 7 overlaps de-duplicated`
- `Elum org-based resolution: 140 assets`

So 140 = 66 from the legacy `[Tier] Lite` group + 74 from the 40 flagged sub-orgs.

**The legacy logic already does what you described.** It takes every member of `[Tier] Lite`, drops anyone in the NOT group (none configured), routes members that are also in `[Add-on] Remote eConf` into the "with eConf" bucket and everyone else into the "standard" bucket. 73 members in, 66 priced, 7 skipped only because those same assets were already resolved through a Lite sub-org (counted once there, not lost).

**The 32 missing sites are on the sub-org side, not the legacy side.** Three unverified candidates, in order of likelihood:

1. 19 sub-orgs currently carry no tier flag at all, so their assets are excluded from every tier.
2. `getAssetsForOrg` swallows API errors and returns an empty list; the code then silently falls back to filtering the global `/assets` response, and if that also misses the org the assets just vanish with no warning and the sync still reports "synced".
3. `/orgs?parent_org_id=...` returns direct children only and is fetched without pagination — grandchild orgs or a truncated page would silently shrink the tier.

There is also a separate noise bug: 180 "disappeared" events were logged for this contract today. Change detection is skipped only when the *previous* sync was partial, not when the *current* one is — so every timed-out partial run (50 of 140 assets) marks ~90 sites as disappeared.

## Plan

### 1. Make the resolution auditable (first step, before any behaviour change)

- Log and persist a per-org resolution snapshot in `cached_capabilities`: for each Lite sub-org, the asset count and whether it came from the org-scoped endpoint or the global fallback, plus the list of unassigned org names with their asset counts.
- Add the same breakdown to the sync toast/contract page so a drop can be attributed to a specific org immediately.

### 2. Stop silent asset loss

- `getAssetsForOrg`: on API error, throw instead of returning `[]`. Treat a failed org as a hard sync failure so the previous cache is preserved (same pattern already applied to asset-group fetches).
- Only use the global `/assets` fallback when the org endpoint genuinely returned zero assets, and log that case distinctly.
- Follow the `/orgs` response for pagination/next-page links and recurse one level into child orgs, so nested orgs under a Lite sub-org are not missed.

### 3. Surface unassigned orgs with impact

- Upgrade the existing `elum_org_unassigned` alert to include how many assets and how many MWp are sitting in flag-less sub-orgs, so it is obvious when a re-flagged org is the reason for a count drop.

### 4. Stop false "disappeared" events

- Skip `detectAssetChanges` when the *current* sync result is partial (in addition to the existing previous-partial guard), and clean up the phantom disappeared rows recorded today for this contract.

### 5. eConf on sub-org assets (confirm)

Today the `[Add-on] Remote eConf` group is applied only to legacy asset-group members; sub-org assets get eConf purely from the org's `remote_econf` feature flag. If an asset inside a Lite sub-org is in the eConf group but its org lacks the flag, it is billed without the add-on. I can extend the AND-group check to sub-org assets too, but that changes billing, so I will leave it out unless you confirm.

## Technical notes

Files touched: `supabase/functions/ammp-sync-contract/index.ts` (org discovery, `getAssetsForOrg`, legacy split logging, alerts, change-detection guard), `src/pages/ContractDetails.tsx` (surface the per-org resolution breakdown). One data cleanup query on `asset_status_history` for the phantom rows.

## What happened

The C&I Lite contract (`ammp_asset_group_id` = "[Tier] Lite") did not lose sites in AMMP — the last sync silently dropped them.

Evidence from the 07:21 sync logs:

```text
07:20:51 Fetching members for group d1ac54d1... ([Tier] Lite)
07:20:55 ERROR Failed to fetch group d1ac54d1... members:
         Rate limit exceeded for trace 019fb1e4... Retry after 3550ms.
07:21:00 Found 88 members in group 88517d88... ([Add-on] Remote eConf)
07:21:00 Legacy asset group merged: 0 members -> 0 standard, 0 eConf, 0 excluded
```

`getAssetGroupMembers` catches any error and returns an empty array. So the primary group came back empty, both legacy pseudo-orgs ("Legacy asset group — standard" / "— with eConf") were skipped, and the cached capabilities were written with only the 67 org-flag-resolved sites and no legacy rows. Nothing warned the user: `doubleCountWarnings` is empty, sync status is `synced`.

Two defects:

1. The retry helper does not honour AMMP's rate-limit response (`Retry after 3550ms`) for this call path, so the group fetch gives up.
2. A failed group fetch is indistinguishable from a genuinely empty group, and the sync happily overwrites a previously populated cache.

## Fix

**1. Distinguish failure from empty (`supabase/functions/ammp-sync-contract/index.ts`)**
- Change `getAssetGroupMembers` to rethrow instead of returning `[]` on error (or return a `{ ok, members }` result).
- In the legacy-asset-group block and the non-Elum asset-group branches, treat a failed member fetch as a hard sync failure: mark the contract `error`, keep the existing `cached_capabilities` untouched, and return the real reason. This matches the existing guard that prevents empty syncs from wiping caches.

**2. Respect the rate limit**
- In `postJsonWithRetry` / `fetchAMMPData`, detect AMMP's rate-limit response (429 or the "Retry after Nms" message), parse the delay, wait it out and retry (a few attempts, capped) instead of failing.
- Add a small delay/serialisation between consecutive `/asset_groups/*/members` calls so the tier group and the eConf add-on group don't trip the limiter back-to-back.

**3. Make the loss visible**
- If a sync completes with fewer sites than the previous cache by a meaningful margin, raise the existing Elum alert channel with a "site count dropped from X to Y" notice, so a partial result is never silently accepted.

**4. Re-sync**
- Re-run the sync for this contract and confirm the legacy standard / eConf rows and their sites reappear in the support document.

## Technical notes

- No database migration.
- Files touched: `supabase/functions/ammp-sync-contract/index.ts` only (plus a redeploy).
- Invoice logic is unchanged; this restores the input data.

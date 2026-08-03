# Internal contract: sync runs but never records a sync

## What the logs show

Your manual syncs did fire (14:17, 14:20, 14:22 today). Each one ends the same way:

```text
WARNING Time budget reached during nested org discovery — stopping recursion
INFO    Elum internal: 0 orgs (182 sub-orgs, 18 unassigned holding 3975 assets)
INFO    Found 33 members in group b478cedf...
INFO    Timeout approaching, saving partial progress (0 new + 0 existing)
ERROR   Aborting update: sync returned 0 assets but 33 were cached. Keeping previous cache.
```

Three things stack up:

1. Org discovery walks 182 sub-orgs and recurses one level into each. Nested `/orgs` calls get rate-limited, and the retry honours AMMP's `Retry after ~55s` — two of those consume the entire 110s request budget before a single asset is processed.
2. No sub-org under the Elum parent carries the `elum_internal` flag (`0 orgs`), so this discovery pass produces nothing for this contract. Its 33 assets come purely from the legacy asset group.
3. With no time left, the asset loop processes 0 assets. The safety guard then aborts the whole database write — and `last_ammp_sync` / `ammp_sync_status` are part of that same write, so the timestamp never moves and the run looks like it never happened.

## Plan

### 1. Always record the attempt

Split the write: when the guard aborts because a run returned 0 assets, still write `ammp_sync_status` and `last_ammp_sync` (and the reason) while leaving `cached_capabilities` untouched. A protected cache should never mean an invisible sync.

### 2. Don't spend the whole budget on rate-limit waits

- Cap the wait honoured for a `Retry-after` during org discovery. If the required wait would push past the remaining budget, skip that org, record it as unresolved, and continue instead of sleeping 55s.
- Reserve a fixed slice of the request budget (e.g. 40s) for the asset loop so discovery can never leave it with zero time.

### 3. Skip discovery work that cannot contribute

- Fetch the flat sub-org list first; only recurse into a child when the budget reserve allows, and stop recursing entirely once the elapsed time crosses the discovery cap.
- When a contract's tier yields zero matching orgs at the top level and the contract has a legacy asset group configured, go straight to the asset-group path rather than recursing 182 orgs for nothing.

### 4. Surface the outcome on the contract page

Show the abort reason next to the sync badge ("last run resolved 0 assets — previous data kept, orgs unresolved: N") so a preserved-cache run is visibly different from a successful one.

## Technical notes

Files: `supabase/functions/ammp-sync-contract/index.ts` (discovery budget/reserve, rate-limit wait cap, split status write, abort reason in `cached_capabilities` metadata) and `src/pages/ContractDetails.tsx` (badge/reason display). No schema change.

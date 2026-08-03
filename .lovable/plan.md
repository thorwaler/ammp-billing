# Internal contract: sync runs but never records a sync

## What the logs show

Your manual syncs did fire (14:17 through 14:24 today). Each ends the same way:

```text
WARNING AMMP API call for /orgs?parent_org_id=95ccdbc5-… failed:
        Rate limit exceeded for trace 019fc801…. Retry after 55135ms.
        — retrying in 55635ms (attempt 1)
WARNING Time budget reached during nested org discovery — stopping recursion
INFO    Elum internal: 0 orgs (182 sub-orgs, 18 unassigned holding 3975 assets)
INFO    Found 33 members in group b478cedf...
INFO    Timeout approaching, saving partial progress (0 new + 0 existing)
ERROR   Aborting update: sync returned 0 assets but 33 were cached. Keeping previous cache.
```

That rate limit is not AMMP. AMMP answers fine — the proxy log shows `/orgs` and `/asset_groups/.../members` returning 200 in 40-64ms. The limit is the Cloud edge-function gateway throttling **function-to-function invocations per trace**: `ammp-sync-contract` calls the separate `ammp-data-proxy` function once per AMMP request, and walking 182 sub-orgs means hundreds of internal invocations in one trace. The gateway then demands a ~55s wait, which consumes the entire 110s request budget before any asset is processed.

With 0 assets processed, the safety guard aborts the whole database write — and `last_ammp_sync` / `ammp_sync_status` are part of that same write, so the run leaves no trace.

## Plan

### 1. Call AMMP directly instead of hopping through the proxy

Inside `ammp-sync-contract`, replace the per-call invocation of `ammp-data-proxy` with a direct `fetch` to the AMMP data API using the same token exchange. This removes the internal-invocation limit entirely — the sync then only faces AMMP's own (fast) responses. The proxy function stays for browser-side callers.

### 2. Stop discovery from consuming the whole budget

- Reserve a fixed slice of the request budget (e.g. 40s) for the asset loop, so discovery can never leave it with zero time.
- Cap any honoured `Retry-after` wait at the remaining budget: if the wait would exceed it, skip that org, record it as unresolved, and continue rather than sleeping.

### 3. Always record the attempt

Split the write: when the guard refuses to overwrite the cache because a run resolved 0 assets, still write `ammp_sync_status` and `last_ammp_sync` plus the abort reason, leaving `cached_capabilities` untouched. A protected cache should never mean an invisible sync.

### 4. Surface the outcome on the contract page

Show the abort reason next to the sync badge ("last run resolved 0 assets — previous data kept, N orgs unresolved") so a preserved-cache run looks different from a successful one.

## Technical notes

Files: `supabase/functions/ammp-sync-contract/index.ts` (direct AMMP fetch in `fetchAMMPData`, discovery budget reserve, retry-wait cap, split status write) and `src/pages/ContractDetails.tsx` (badge/reason display). No schema change; `ammp-data-proxy` is left in place for the frontend.

Side note visible in the same logs: this contract's tier resolves `0 orgs` — no sub-org under the Elum parent carries the `elum_internal` flag, so its 33 assets come purely from the `[Tier] Internal` legacy asset group. Worth confirming separately whether the flag is expected to be set.

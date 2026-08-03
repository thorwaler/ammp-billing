# Knowing when an AMMP sync is truly finished

## Today

The function already returns `syncStatus: 'synced' | 'partial'` and auto-continues partial runs in the background (up to a max attempt count), writing a notification when it finally completes. But the contract page only shows a raw status badge (`contract.ammp_sync_status`) and the last sync time, and it does not refresh while the background continuations run. So after a run that hits the 110s deadline, there is no visible signal of how far along it is, which orgs are still unresolved, or whether the continuation chain gave up.

## Plan

### 1. Persist sync progress in the cache

Add a `syncProgress` block to `cached_capabilities` written on every run:

- `syncedAssets` / `totalExpected`
- `orgsResolved` / `orgsDiscovered` and the list of org names not yet resolved this run
- `deadlineHit` (true when the request-wide budget cut the run short)
- `continuationAttempt`, `maxContinuationAttempts`, `lastAttemptAt`
- `finishedAt` set only when the run completes with `synced`

The auto-continuation loop updates `continuationAttempt` and `lastAttemptAt` before each retry, and marks `gaveUp: true` when the attempt cap is reached.

### 2. Live progress on the contract page

In the AMMP section of `ContractDetails.tsx`:

- Replace the raw status badge with an explicit state: **Synced** (green, with "all N orgs resolved, X sites"), **Syncing — X of Y sites, attempt N of M** (amber, animated), **Incomplete — stopped after M attempts** (red).
- While the status is `partial`, poll the contract row every 10s so the badge advances on its own and flips to Synced without a manual refresh.
- Show `finishedAt` next to "Last sync" so a stale partial is obvious.

### 3. Org coverage in the audit panel

Extend the existing "Org resolution" panel with a header line — `Orgs resolved: 38 / 40` — and list any org that was skipped because of the deadline, so an incomplete tier can be attributed immediately.

### 4. Completion notification stays

The existing "fully synced after N continuation(s)" notification is kept; add a matching failure notification when the continuation chain gives up, so a never-finishing sync is not silent.

## Technical notes

Files: `supabase/functions/ammp-sync-contract/index.ts` (`CachedCapabilities` type, `processContractSync` return, continuation loop), `src/pages/ContractDetails.tsx` (badge, polling, org panel). No schema change — everything rides in the existing `cached_capabilities` JSON and `ammp_sync_status` column.

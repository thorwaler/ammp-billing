# Why the Internal contract's last sync date is stuck

## What the data shows

The Internal (Elum 2026) contract last synced on 30 July — the same timestamp as the other Elum contracts, which is when they were last synced by hand. It is not excluded from the nightly job: it has an asset group and its customer has an AMMP org, so it passes the eligibility filter.

The nightly runs on 31 Jul, 1, 2 and 3 Aug each produced only 3-4 "Contract Synced" notifications, always the same contracts (SPS, Matriarch, ePM Pro+, Bidvest), and no final run-summary notification was written on any of those days. There are ~20 eligible active contracts.

So the scheduled job starts, works through its first batch, and the background task is terminated before it reaches batch 2 — every later contract, including Internal, is never touched. The first batch is dominated by the heaviest contract (SPS, 133 sites), which alone takes ~3 minutes because each partial run is retried up to 3 more times inside the same background task.

## Plan

### 1. Stop one batch from consuming the whole run

- Order eligible contracts by `last_ammp_sync` ascending (nulls first) so the least recently synced contract always goes first, instead of the current partial-first ordering that keeps re-picking the same heavy contracts.
- Remove the inline continuation loop (3 extra full syncs awaited in-line). Leave a `partial` contract as partial; the next scheduled pass will pick it up first because it is now the oldest.

### 2. Make the run resumable

- Add a wall-clock budget to `processContractsInBackground`. When it is exceeded, stop cleanly, write the summary notification with "processed X of Y — remaining contracts continue on the next run", and re-invoke `ammp-scheduled-sync` once to continue with the still-unsynced contracts.
- Guard the re-invocation with a run counter so a stuck contract cannot cause an endless chain.

### 3. Make a skipped contract visible

- The run summary currently only fires on completion. Emit it on early exit too, listing how many contracts were not reached, so a contract silently going stale for days is noticeable.

## Technical notes

Files: `supabase/functions/ammp-scheduled-sync/index.ts` only — `getSyncableContracts` (ordering), `processContractsInBackground` (budget, continuation removal, summary on early exit), and the handler (continuation invoke + run counter). No schema change, no change to `ammp-sync-contract`.

Note: `getSyncableContracts` also reads the customer org as `c.customers?.[0]?.ammp_org_id`, but the embedded `customers` relation returns an object, not an array, so that fallback never resolves. It does not affect the Internal contract (it qualifies via its asset group), but it is fixed in the same pass.

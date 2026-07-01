# Fix: Automated AMMP sync has been broken since April 5, 2026

## What's actually happening

The daily 02:00 UTC AMMP sync cron has been failing silently for ~3 months. When you opened contracts yesterday and saw no synced assets, that's because nothing had been auto-synced — the "synced" contracts you see were updated only when you (or someone) hit the manual resync button.

Two compounding bugs:

1. **Auth guard blocks cron invocations.** `supabase/functions/ammp-scheduled-sync/index.ts:430` calls `resolveAuthorizedUser()` unconditionally at the top of the handler. Supabase cron fires the function with no `Authorization` header, so this throws `"User authentication required"` and returns HTTP 500 before any sync logic runs. No notification, no log surfaced to the UI.
2. **`ammp_connections.sync_schedule` is `"weekly"`, not `"daily"`.** Even if auth were fixed, `shouldRunToday("weekly")` only passes on Sundays. Project memory says the schedule should be daily.

Evidence from the DB:
- `last_sync_at = 2026-04-05` (a Sunday — the last time both bugs happened to align)
- `next_sync_at = 2026-04-12` (never updated since)
- 24/26 contracts got manually resynced on 2026-06-30; Daybreak and Energea are still at April 5.

## Plan

### 1. Fix the auth guard in `ammp-scheduled-sync`

Restructure `index.ts` so `resolveAuthorizedUser` is only called on the manual HTTP path:

- Detect cron invocation by absence of `Authorization` header (or presence of the service-role key).
- On cron path: use the service-role Supabase client directly, iterate `ammp_connections`, and derive `user_id` from each connection row (already fetched).
- On manual path: keep the existing `resolveAuthorizedUser` flow so user-initiated syncs continue to work with their JWT.
- Keep the existing `isServiceRoleRequest` 403 guard as a defense-in-depth check on the scheduled branch.

### 2. Flip the schedule back to daily

Update the `ammp_connections` row(s): `sync_schedule = 'daily'`, and reset `next_sync_at` to the next 02:00 UTC. Done via migration so it's reproducible.

### 3. Backfill the two stuck contracts

Trigger a one-off sync for Daybreak Power Solutions and Energea after the fix deploys, so their `last_sync_at` catches up. Also worth confirming they aren't filtered out by `getSyncableContracts` (e.g., missing `ammp_org_id` / `ammp_asset_group_id`, or POC package) — if they are, that's expected and no action needed.

### 4. Add a lightweight failure signal

Right now scheduled failures are completely silent. Add a `notifications` insert (severity `error`, type `ammp_sync_failed`) whenever the scheduled path throws, so you'd see this in the UI next time instead of discovering it during invoicing.

## Files touched

- `supabase/functions/ammp-scheduled-sync/index.ts` — split cron vs manual auth paths, add failure notification.
- New migration — set `sync_schedule = 'daily'`, recompute `next_sync_at`.
- No frontend changes.

## Out of scope

- Not touching the manual sync button flow (works fine).
- Not changing `resolveAuthorizedUser` itself — other functions rely on it.

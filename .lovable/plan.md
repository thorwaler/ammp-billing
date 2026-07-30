## What's wrong

The logs from the last enrichment run show every device fetch failing with the same cause:

```
[AMMP Device Enrichment] Failed to fetch devices for 82874d23-...:
RateLimitError: Rate limit exceeded for trace 019fb25d... Retry after 59171ms.
```

`ammp-device-enrichment` fires 10 simultaneous internal calls to `ammp-data-proxy` per wave (`BATCH_PARALLEL = 10`, batch of 50). The edge gateway rate-limits internal invocations per trace and asks for a ~59s wait. The function does none of that:

- `fetchAMMPData` is a plain `fetch` with no retry and no `Retry-after` handling — unlike `ammp-sync-contract`, which already has a `postJsonWithRetry` helper that honours the hint.
- Worse: a failed fetch is swallowed in the `catch` and returned as `devices: []`. The asset is then run through `calculateCapabilitiesFromDevices`, marked as attempted/confirmed-empty, and written back to `cached_capabilities`. So a rate-limited run silently wipes hybrid/Solcast flags and permanently excludes those assets from future refetches.

That's the same class of bug already fixed for asset-group members in the contract sync: a transient API failure must never be persisted as "no data".

## Fix

**1. Share the retry helper**
Move `parseRetryAfterMs` / `isRateLimited` / `postJsonWithRetry` out of `ammp-sync-contract/index.ts` into `supabase/functions/_shared/internalFetch.ts` (with a `label` parameter for logging) and import it from both functions. Behaviour stays identical for the contract sync.

**2. Use it in enrichment**
`getToken` and `fetchAMMPData` in `ammp-device-enrichment` call the shared helper instead of raw `fetch`, so token exchange and every proxy call retry with backoff and honour `Retry after Nms`.

**3. Never persist a failed fetch as empty**
In the per-asset map, distinguish failure from a genuine empty device list: return `{ assetId, devices, failed: true }` on error. Assets with `failed: true` are skipped entirely — not enriched, not marked attempted, not marked `deviceEnrichmentConfirmedEmpty`, and they stay in the "remaining" count so the next run retries them.

**4. Reduce concurrency and adapt**
Drop `BATCH_PARALLEL` from 10 to 4, and add a small pause between waves. If a wave comes back with any rate-limit failure, stop the run early rather than burning the remaining assets against a closed window, and return `rateLimited: true` in the response.

**5. Report honestly**
The response gains `failed` (count of assets skipped due to errors). If every asset in the batch failed, return a non-success response so the caller/UI shows the enrichment did not run instead of reporting "Complete: 0 enriched".

## Technical notes

- Files touched: `supabase/functions/_shared/internalFetch.ts` (new), `supabase/functions/ammp-device-enrichment/index.ts`, `supabase/functions/ammp-sync-contract/index.ts` (import instead of local copy).
- No database or schema changes.
- No frontend change required; the enrichment poller keeps calling until `remaining` reaches 0, which now correctly includes previously-failed assets.
- After deploying, a run on an affected contract will re-attempt assets that were wrongly marked empty only if they were not already flagged `deviceEnrichmentConfirmedEmpty`. If you want those cleared too, say so and I'll add a one-off reset of that flag for assets with zero devices.

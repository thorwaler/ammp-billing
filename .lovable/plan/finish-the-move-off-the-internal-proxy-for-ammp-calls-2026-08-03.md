# Finish the move off the internal proxy for AMMP calls

Your AMMP-side logs confirm what the fix assumed: for that correlation id, the data-api requests completed without errors. The "rate limit exceeded, retry after ~55s" messages came from our own edge-function gateway throttling function-to-function calls, not from AMMP.

The contract sync now calls AMMP directly, so it no longer trips that throttle. Device enrichment still goes through the internal proxy, and it is the heaviest caller of all (one call per asset, in batches), so it remains exposed to the same stall.

## What to change

### 1. Shared direct AMMP client
Move the direct-fetch logic that now lives inside the contract sync into a shared helper both AMMP functions import. It keeps the behaviour already in place:
- direct call to the AMMP data API with a 25s per-request timeout
- retries on network errors, 429s and 5xx, honouring any retry-after hint
- never waiting longer than the caller's remaining time budget
- the "no devices" fallback: a 404 on an asset's devices endpoint falls back to the asset record with an empty device list

### 2. Device enrichment uses it
Replace the proxy hop in device enrichment with the shared client. Enrichment keeps its existing concurrency limit and its rule of never persisting a failed fetch as "no devices".

### 3. Keep the proxy for the browser
The proxy function stays as-is: the app's client-side code calls it and must keep doing so, since the AMMP key must not reach the browser.

## Verification
- Trigger a sync on the Elum Internal contract and confirm it reaches `synced` (or `partial` with real progress) instead of a 504.
- Check the function logs for the absence of "Rate limit exceeded for trace" during the run.
- Trigger device enrichment on that contract and confirm assets come back with device counts rather than empty lists.

## Technical notes
- New file: `supabase/functions/_shared/ammpClient.ts` exporting `fetchAmmpData(token, path, method, deadline)`.
- `ammp-sync-contract/index.ts`: local `fetchAMMPData` becomes a thin wrapper that passes `requestDeadline` to the shared client.
- `ammp-device-enrichment/index.ts`: `fetchAMMPData` switches from `postJsonWithRetry(.../ammp-data-proxy)` to the shared client; the `postJsonWithRetry` import is dropped if it becomes unused.
- No database or UI changes.

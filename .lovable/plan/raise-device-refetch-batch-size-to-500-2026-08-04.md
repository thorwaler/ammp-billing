# Raise device refetch batch size to 500

Device enrichment currently processes at most 50 assets per run, with low concurrency and a 25s cutoff that were tuned for the old rate-limited gateway path. Since enrichment now calls the AMMP API directly, these limits can be raised.

## Changes

1. `supabase/functions/ammp-device-enrichment/index.ts`
   - Default `batchSize` 50 -> 500.
   - Increase parallel fetch wave from 4 to 12 and drop the 250ms inter-wave pause to 0-50ms.
   - Raise the internal time guard from 25s to ~110s so a 500-asset batch can actually finish inside the edge function limit; anything not done still rolls over to the next run as today.
   - Keep the existing safeguards: failed fetches are never written as "no devices", rate-limit detection still stops early, and partial progress is persisted.

2. Callers pass 500 instead of 50
   - `src/pages/ContractDetails.tsx` (manual enrich / force refetch buttons)
   - `supabase/functions/ammp-sync-contract/index.ts` (two auto-trigger calls)

## Notes

Time guard, not asset count, becomes the real limit. If a very large contract still can't finish in one run, the existing "remaining assets" response keeps the incremental behaviour intact.

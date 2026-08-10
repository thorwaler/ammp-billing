# Fix: Jubaili genset ratings (kVA) never land in the contract cache

## What I verified

Live read-only probe against AMMP with the project's own API key:

- `GET /v1/assets?org_ids=bd6ad843-…` (the Jubaili contract's org) returns **769 assets, 597 with a `genset_capacity`** value.
- `GET /v1/asset_groups/ab68b795-…/members` returns the **575** sites the contract bills.
- Overlap: **all 575 group members exist in the org list, and 574 of them have a rating.** The data is there and the current lookup key (`asset_id`) matches perfectly.

Yet the stored cache for contract `Jubaili` has **0 of 575** rated, and the cached asset entries contain **no `gensetKVA` key at all** — not even `null`.

The sync logs from this morning's run show the lines immediately before and after the rating lookup ("575 total assets, 575 need processing", "Large sync (575 assets) - skipping device details") but **never the rating lookup's own log line**, and never its warning branch either. Neither branch can be silent, so the code that runs in the deployed function does not contain the rating lookup — the source change is present in the repo but is not what executed.

## Plan

1. **Redeploy `ammp-sync-contract`** and confirm the running version logs the rating lookup line. This alone is likely the whole fix.
2. **Harden the lookup so it cannot silently no-op:**
   - Resolve the rating org from `contract.ammp_org_id` → `contract.contract_ammp_org_id` → the customer's `ammp_org_id` (today only the first two are tried).
   - Log rated/total counts and how many contract assets were matched vs. missed, so a future regression is visible in one line.
   - If the org call fails, mark the sync partial instead of writing a cache full of `null` ratings — a failed fetch must not look like "no site is rated".
3. **Make ratings independent of the device phase.** The rating merge must run for every asset written to the cache, including large syncs that skip device details and including the continuation batches, so a 575-site portfolio gets ratings on the first pass.
4. **Verify:** re-sync the Jubaili contract and confirm the cache reports ~574/575 rated, then check the contract detail page's ratings strip and the invoice calculator show the same, with only genuinely unrated sites listed.

## Technical notes

- Files: `supabase/functions/ammp-sync-contract/index.ts` (rating lookup + merge), no schema change needed.
- `ammp-device-enrichment` spreads existing asset entries, so it preserves `gensetKVA` — no change required there.
- `null` stays `null` (rating not set) and is kept distinct from an explicit `0`, as before.

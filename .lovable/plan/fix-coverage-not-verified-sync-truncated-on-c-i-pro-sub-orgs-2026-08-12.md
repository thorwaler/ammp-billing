# Fix "coverage not verified (sync truncated)" on C&I Pro sub-orgs

## What's happening

The label is not about a timeout in this case. During the last C&I Pro sync the logs show:

```text
Failed to fetch group d1ac54d1-... members: HTTP 404: Asset group ... not found
Sibling group d1ac54d1-... lookup failed: groupNotFound: true
Unassigned sub-org coverage: 0 covered, 0 elsewhere, 0 not covered (skipped — resolution truncated)
```

A sibling Elum contract points at an AMMP asset group that has been deleted. That single 404
sets the global `resolutionTruncated` flag, and the coverage loop then skips **every** flag-less
sub-org, marking each one `partial` — which the contract page renders as
"coverage not verified (sync truncated)". So one dead asset group blanks out coverage
reporting for all sub-orgs, even though there was plenty of time budget left.

## Fix

1. **Don't treat a deleted sibling group as truncation.** In the sibling lookup, catch the
   `groupNotFound` (404) case separately: log a warning, skip that sibling, and keep going.
   Only real failures (network/5xx) or the time budget should set `resolutionTruncated`.
2. **Make truncation per-org, not global.** Replace the `resolutionTruncated || budgetExceeded()`
   short-circuit inside the flag-less org loop with a check on the time budget only, so orgs
   already resolved keep their real numbers and only the ones actually skipped are marked partial.
3. **Distinguish the two states in the UI.** On the contract page's org-resolution panel, show
   "coverage not verified (ran out of time — re-sync to complete)" for budget skips and
   "coverage partially verified — a sibling tier's asset group no longer exists in AMMP" when
   sibling data was incomplete, so the message points at the real cause.
4. **Surface the dead group once.** Log/flag the missing sibling group id so the stale
   `ammp_asset_group_id` on the sibling contract can be cleared.

## Technical notes

- `supabase/functions/ammp-sync-contract/index.ts`: sibling loop ~L737-765, flag-less org loop
  ~L771-776, summary log ~L862. `getAssetGroupMembers` already throws with `groupNotFound: true`,
  so the 404 case is easy to branch on.
- `src/pages/ContractDetails.tsx` ~L1691: replace the single `o.partial` branch with the two
  reason-specific messages (`o.source === 'unresolved'` vs a new `siblingIncomplete` marker).
- Redeploy the edge function and re-sync the C&I Pro contract to confirm the panel shows real
  coverage counts for each sub-org.

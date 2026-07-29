## Goal

Make the sub-org asset resolution that now works for the C&I Light contract reliable for every 2026 Elum tier (Light, Pro, Utility), and fix the bug that silently discards the org data after sync.

## Confirmed findings

- The sync itself is already tier-generic: `ammp-sync-contract/index.ts:349-352` maps `ci_lite/ci_pro/utility` to `epm_lite/epm_pro/epm_utility`, and the per-sub-org `/assets?org_ids=…` resolution at lines 465-517 runs for whichever tier the contract carries. Logs confirm the last run resolved 11 tier orgs / 33 assets for the Light contract.
- **Bug: org data is wiped right after sync.** `ammp-device-enrichment/index.ts` (~line 466) rebuilds `cached_capabilities` field-by-field instead of spreading the existing object, so `orgBreakdown`, `doubleCountWarnings` and `unassignedOrgs` are dropped. Verified in the database: the Light contract synced at 13:59:52 with 33 assets / 13.15 MW, then enrichment ran at 14:01:05 and the stored `cached_capabilities` now has **no `orgBreakdown` key at all**. Pricing, Xero per-org lines and the support-document org tables therefore fall back to the non-org path for every org-based Elum contract.
- **Bug: `zero-pv-check/index.ts:38` reads `cached_capabilities.assets`**, a key that does not exist (the array is `assetBreakdown`), so zero-PV detection never fires for any contract.
- Only one 2026 org contract exists today (`elum_ci_lite`); no Pro or Utility contract exists yet, so those paths have never executed against real data.

## Changes

1. **Preserve org data through enrichment** — in `ammp-device-enrichment/index.ts`, build the updated capabilities by spreading `cachedCapabilities` first (as the other branch at ~line 320 already does), so `orgBreakdown`, `doubleCountWarnings`, `unassignedOrgs` and any future fields survive. Redeploy.
2. **Repair the existing Light contract** — re-run the contract sync so `orgBreakdown` is written back, then confirm the key persists after enrichment completes.
3. **Fix zero-PV asset lookup** — point `zero-pv-check` at `cached_capabilities.assetBreakdown` (keeping `.assets` as a fallback). Redeploy.
4. **Verify Pro and Utility end to end** — temporarily point a scratch contract at each tier (or run the sync with the tier switched) to confirm `epm_pro` / `epm_utility` sub-orgs resolve assets via the org-scoped endpoint, log the org and asset counts, and confirm the Utility >2 MWp guard behaves on real site sizes. Fix whatever the runs surface.
5. **Guard against silent regressions** — when a contract has `elum_tier` + `elum_parent_org_id` but the cached capabilities carry no `orgBreakdown`, surface a clear "org breakdown missing — re-sync required" warning in the invoice calculator instead of silently pricing on the flat path.

## Technical notes

Files touched: `supabase/functions/ammp-device-enrichment/index.ts`, `supabase/functions/zero-pv-check/index.ts`, `src/components/dashboard/InvoiceCalculator.tsx`. No schema or migration changes. Both edge functions get redeployed and re-checked against logs.

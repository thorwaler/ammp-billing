# Elum Internal: feature-flag first, asset group as fallback

Today the legacy "Elum Internal Assets" package (`elum_internal`) resolves its sites only from the configured AMMP asset group. This change makes it look for sub-organisations carrying the `elum_internal` feature flag first, and fall back to the asset group only when no flagged org is found.

## Behaviour

1. On sync, if the contract has an Elum parent org set, discover its sub-orgs (including one nested level) and keep those whose feature flags include `elum_internal`.
2. If one or more flagged sub-orgs are found: pull their assets from the org-scoped assets endpoint and bill those. The asset group is ignored (its NOT/exclusion group is still applied, so exclusions keep working).
3. If no flagged sub-org is found (or no parent org is configured): fall back to the current asset-group resolution, unchanged.
4. The resolution source is recorded so the contract page shows whether the sites came from feature flags or the asset group, plus per-org asset counts.

Pricing is untouched — graduated MW brackets still apply to the resulting portfolio.

## Contract form

- Add the "Elum parent org ID" field to the `elum_internal` package (same field the 2026 org-tier packages use, `elum_parent_org_id`).
- Keep the asset group fields visible, described as the fallback source.
- Update the package help text to explain the flag-first / group-fallback order.

## Technical notes

- `supabase/functions/ammp-sync-contract/index.ts`: add a branch for `packageType === 'elum_internal'` before the generic asset-group branch. Reuse the existing `getClassifiedSubOrgs` (already maps `internal -> elum_internal`) and `getAssetsForOrg` helpers, plus the existing time-budget guards so a large org can still return a partial sync rather than an empty one.
- Populate `orgResolutionLog` and `tierOrgs` with the flagged orgs so the existing "Org resolution" panel on the contract page renders them; mark the fallback path with source `asset-group`.
- `src/components/contracts/ContractForm.tsx`: show the parent-org field and adjust the description for this package.
- No database or pricing changes.

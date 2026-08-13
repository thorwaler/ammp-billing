# Elum: recognise `epm_internal`, flag multi-flag orgs, exclude the virtual-assets org

## Behaviour changes

1. **`epm_internal` counts as an internal flag**, alongside `elum_internal`. Tier precedence stays exactly as it is today (first match in Lite, Pro, Utility, Internal order) — internal does not win over other tiers.
2. **Multi-flag detection**: when a sub-org carries more than one tier flag (e.g. `epm_pro` + `epm_internal`), record all matched flags and raise a warning alert naming the org and its flags, so the ambiguity is visible instead of silently resolved.
3. **Hard exclusion for the Elum virtual-assets org** (`84864a91-bfb7-4504-9d3d-bb109ffc4fec`): it is dropped from org discovery entirely, regardless of its feature flags. It contributes no assets and no MWp to any contract, is not counted as an unassigned/uncovered org, and does not trigger the multi-flag warning. The org resolution panel notes it as excluded.

No pricing formulas, asset-group fallback behaviour, or database schema change.

## Technical notes

- `supabase/functions/_shared/elumFlags.ts`:
  - Internal maps to both `elum_internal` and `epm_internal`; keep first-match tier order unchanged.
  - `classifyOrgRow` also returns `matchedTiers: string[]` so callers can detect multi-flag orgs.
  - Export `EXCLUDED_ORG_IDS` containing the virtual-assets org id, with a comment explaining why.
- `supabase/functions/ammp-sync-contract/index.ts`:
  - Filter `EXCLUDED_ORG_IDS` out inside `getClassifiedSubOrgs` (~L451) so every branch — Internal flag-first, 2026 org tiers, coverage checks — excludes it in one place; also skip its assets in any global-fallback asset filtering.
  - After classification, collect orgs with `matchedTiers.length > 1` and push a warning alert listing org name plus flags, next to the existing unassigned-sub-org alert (~L1646); update that alert's text to mention `epm_internal`.
- `src/data/pricingData.ts` + `src/services/ammp/orgService.ts`: mirror the multi-flag structure and the excluded-org list so the browser-side classifier matches the sync.
- `src/pages/ContractDetails.tsx`: show the excluded org line in the Org resolution panel when present.
- Redeploy `ammp-sync-contract`, then re-sync the Elum Internal and C&I Pro contracts to confirm the virtual-assets org is absent from both and that any genuine multi-flag org surfaces as a warning.

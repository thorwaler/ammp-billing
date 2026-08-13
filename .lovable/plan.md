# Elum: `epm_internal` wins, flag conflicting billing flags, exclude the virtual-assets org

## Behaviour changes

1. **`epm_internal` counts as an internal flag**, alongside `elum_internal`, and **internal always takes priority**. An org flagged `epm_pro` (or Lite/Utility) that also carries an internal flag is classified as internal, billed on the Internal contract, and drops out of the Pro/Lite/Utility portfolio.
2. **Conflict flagging on billing flags only.** Tier flags considered: `epm_lite`, `epm_pro`, `epm_utility`, `elum_internal`, `epm_internal`. A warning alert is raised only when an org carries **two or more non-internal tier flags** (e.g. `epm_lite` + `epm_pro`). Explicitly not a conflict:
   - any tier flag plus `remote_econf` (that is a normal billable add-on),
   - an internal flag plus any other tier flag (internal wins, resolved silently),
   - any number of unrelated, non-billing feature flags.
3. **Hard exclusion for the Elum virtual-assets org** (`84864a91-bfb7-4504-9d3d-bb109ffc4fec`): dropped from org discovery entirely, regardless of its feature flags. It contributes no assets and no MWp to any contract, is not counted as unassigned/uncovered, and raises no conflict warning. The org resolution panel notes it as excluded.

No pricing formulas, asset-group fallback behaviour, or database schema change.

## Technical notes

- `supabase/functions/_shared/elumFlags.ts`:
  - Internal maps to both `elum_internal` and `epm_internal`; `classifyOrgRow` checks internal first and returns `internal` when either is present, otherwise falls back to the existing Lite/Pro/Utility order.
  - Return `matchedTiers: string[]` (all tier flags present, excluding `remote_econf`) so callers can detect conflicts.
  - Export `EXCLUDED_ORG_IDS` containing the virtual-assets org id, with a comment explaining why.
- `supabase/functions/ammp-sync-contract/index.ts`:
  - Filter `EXCLUDED_ORG_IDS` out inside `getClassifiedSubOrgs` (~L451) so every branch — Internal flag-first, 2026 org tiers, coverage checks — excludes it in one place; also skip its assets in global-fallback asset filtering.
  - Collect orgs whose `matchedTiers` contain 2+ non-internal tiers and push a warning alert listing org name plus flags, alongside the existing unassigned-sub-org alert (~L1646); update that alert text to mention `epm_internal`.
- `src/data/pricingData.ts` + `src/services/ammp/orgService.ts`: mirror the multi-flag structure, internal precedence, and excluded-org list so the browser-side classifier matches the sync.
- `src/pages/ContractDetails.tsx`: show the excluded org line in the Org resolution panel when present.
- Redeploy `ammp-sync-contract`, then re-sync the Elum Internal and C&I Pro contracts to confirm the virtual-assets org is absent from both and that any genuine conflicting org surfaces as a warning.

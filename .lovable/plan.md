# Elum Internal: recognise `epm_internal` and give internal precedence

Today an org is classified by the first tier flag found in flag order (Lite, Pro, Utility, Internal), and only `elum_internal` marks an org as internal. The Elum virtual-assets sub-org (`84864a91-bfb7-4504-9d3d-bb109ffc4fec`) carries both `epm_pro` and `epm_internal`, so it is currently classified as C&I Pro and billed on the Pro contract.

## Behaviour changes

1. Internal is recognised from **either** `elum_internal` **or** `epm_internal`.
2. Internal **wins over every other tier flag**. An org flagged Pro (or Lite/Utility) that also carries an internal flag is classified as internal, so it is billed on the Internal contract and drops out of the Pro tier portfolio.
3. Everything downstream follows automatically: Elum Internal flag-first resolution picks the org up, the 2026 org-tier packages exclude it from Pro, and the coverage/unassigned checks still count it as covered.
4. Warning text listing missing tier flags is updated to mention `epm_internal` alongside `elum_internal`.

No pricing formulas, asset-group fallback behaviour, or database schema change.

## Technical notes

- `supabase/functions/_shared/elumFlags.ts`: allow multiple flags per tier (internal -> `['elum_internal', 'epm_internal']`); in `classifyOrgRow`, evaluate internal first and return it regardless of other tier flags, otherwise keep the existing first-match order.
- `src/data/pricingData.ts`: mirror the same structure for `ELUM_TIER_FLAGS`; keep the exported shape compatible with `src/services/ammp/orgService.ts` (`classifyOrg` updated to the same precedence rule) and with any UI that renders the flag name for a tier.
- `supabase/functions/ammp-sync-contract/index.ts`: no logic change needed for the Internal branch (it filters `tier === 'internal'`); update the unassigned-sub-org alert description string (~L1646).
- Redeploy `ammp-sync-contract`, then re-sync the Elum Internal contract and the C&I Pro contract to confirm the virtual-assets org moves from Pro to Internal.

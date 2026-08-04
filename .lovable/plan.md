# Why the Internal contract says 33 while the "Elum Internal" org line says 31

## What the two numbers actually count

They come from two different sources and are not meant to be the same set:

- **33 (contract)** — members of the legacy asset group `b478cedf…`. The `elum_internal` feature flag matched **0** sub-orgs on this sync, so pricing falls back entirely to the group. Group membership is independent of which organisation owns the asset.
- **31 (panel line "Elum Internal")** — assets returned by the org-scoped endpoint for the flag-less sub-org `0febdcb0…` ("Elum Internal"). Ownership by that org, not group membership.

Cached sync data for the contract shows the overlap: 30 covered by this legacy group, 0 eConf, 0 covered elsewhere, 1 uncovered (`Port Saint Louis du Rhone`, 0 MWp), 0 placeholders.

```text
legacy group (33)              org "Elum Internal" (31)
  +-----------------------------+----------------+
  |  3 billed, owned by         |   30 shared    |  1 in the org but
  |    other orgs               |                |  not in the group
  +-----------------------------+----------------+
```

So: **3 of the 33 billed assets live in a different organisation** than the "Elum Internal" sub-org, and **1 asset in that sub-org is not in the group**, therefore not billed. 30 + 3 = 33, 30 + 1 = 31.

Which 3 assets sit outside the org is not currently recorded — the sync stores only the aggregate coverage counters, so this direction (group members not owned by the flag-less org) is unverified today.

## Proposed change: make the panel self-explanatory

1. **Record the reverse diff during sync.** In `ammp-sync-contract`, while running the flag-less coverage pass, also compute the legacy group members that are *not* owned by any flag-less/tier org resolved this run, and store them on the org-resolution payload (ids + names, capped at 20) alongside the existing counters.
2. **Label the org line clearly** in the Org resolution panel on `ContractDetails.tsx`: show it as "31 assets owned by this organisation — 30 of them billed via this contract's asset group", so it is never read as a billed-site count.
3. **Show the reverse diff** as a small note under the legacy-group row: "3 billed assets are owned by other organisations" with the names on hover/expand.
4. **Keep the uncovered alert as is** — `Port Saint Louis du Rhone` is a genuine gap and should stay flagged until it is added to the group (or intentionally excluded).

## Technical details

- `supabase/functions/ammp-sync-contract/index.ts`: in the block that builds `resolved` (the flag-less coverage loop, ~lines 739-828), accumulate a `Set` of all asset ids seen across flag-less and tier orgs; after the loop, diff `legacyMemberIds` against it and write `legacyOutsideOrgs: { count, assets[] }` into the org-resolution section of `cached_capabilities`. Skip the diff when `resolutionTruncated` is true, since the org set is then incomplete.
- `src/pages/ContractDetails.tsx`: adjust the org row copy and render the new `legacyOutsideOrgs` note on the legacy-group row. No pricing or billing logic changes.

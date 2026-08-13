# Elum Internal: why the asset count didn't move (and one real leak)

## What I checked

Live AMMP data for the Elum parent org (272 sub-orgs) and the contract's last sync (08:47 today):

- Exactly **three** sub-orgs carry an internal flag:
  - Elum Internal (`epm_internal`) — 27 assets
  - Assets On Hold (`epm_internal`) — 67 assets
  - Elum Virtual Assets (`epm_internal` + `epm_pro`) — 8 assets, **globally excluded** by design
- No sub-org uses the older `elum_internal` flag at all.
- The contract's last sync resolved: 27 (Elum Internal, org-scoped) + 67 (Assets On Hold, org-scoped) + 6 (legacy asset group) = **100 sites / 178.7 MWp**.

So the flag-first resolution *is* working — 94 of the 100 sites now come from feature-flagged orgs, not from the asset group. The total didn't change because the legacy group `[Tier] Internal` (33 members) already contained 27 of those same assets; the org route adds no new sites beyond what AMMP flags as internal.

## The one real problem

The 6 sites still attributed to the legacy asset group are:

```text
DEV ELUM - Ronflex, Pikachu, Canarticho, Abo, Abra, Goupix
```

All six belong to **Elum Virtual Assets** (`84864a91-…`) — the org we agreed must never be billed. The exclusion is applied during org discovery only, so assets that enter through the legacy asset-group path slip past it and are still counted and billed.

## Proposed fix

1. In `ammp-sync-contract`, apply the excluded-org filter to **every** asset entry path, not just org discovery: after fetching legacy asset-group members (standard and eConf splits, AND/NOT groups included), drop any asset whose `org_id` is in `EXCLUDED_ORG_IDS`.
2. Record the dropped assets in `cached_capabilities.excludedOrgs` (count + names) so the Org resolution panel shows "6 assets skipped — Elum Virtual Assets" instead of them silently disappearing.
3. Surface in the Org resolution panel on the contract page how each tier org was resolved (feature flag vs legacy group), so it's obvious at a glance that 94/100 are flag-based.

Expected result after re-sync: Elum Internal drops from 100 sites to **94 sites**, and the legacy asset-group line disappears entirely (its only remaining contribution is the excluded virtual assets).

## Note

Two unrelated orgs still carry conflicting flags and show in the conflict list: `Usecase4 org (Elum)` and `Demo MC with remote eConf` (both `epm_lite` + `epm_pro`). Those need fixing in AMMP, not here.

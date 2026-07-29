## What I verified

- **Zero-PV toggle**: `zero_pv_alert_enabled` is `false` on **every** contract in the database — including the C&I Light one. The form saves the field correctly, but none of the three edit entry points (`ContractList.tsx:189`, `ContractDetails.tsx:576`, `CustomerCard.tsx:486`) map `zero_pv_alert_enabled` / `zero_pv_grace_days` / `zero_pv_estimate_multiplier` back into `existingContract`. So the form defaults them to `false`, and the next save writes `false` over whatever you enabled. Same gap for `inflation_cap_enabled`, `annual_minimum_mode`, `first_invoice_date`, `anniversary_notice_days`.
- **The 0 MWp sites are real**: the C&I Light contract has 10 of 140 assets at `totalMW = 0`.
- **Timing**: `zero-pv-check` only runs as a monthly cron on the 15th, so even with the flag on you would not see alerts right after a sync.
- **eConf**: in the Elum org-tier branch of `ammp-sync-contract` the legacy asset group is merged as a single pseudo-org hard-coded to `hasEconf: false` (`index.ts:490-509`), and the AND / NOT group fields are ignored entirely on that path — which is why the split needs two contracts today.

## Changes

**1. Contract edit fields round-trip (the toggle bug)**
- Add a single shared mapper, `src/lib/contractFormMapping.ts`, that converts a `contracts` DB row into the `existingContract` shape.
- Use it in `ContractList.tsx`, `ContractDetails.tsx` and `CustomerCard.tsx`, replacing the three divergent hand-written maps. This fixes the zero-PV toggle and the other Elum-foundations fields silently resetting on save.

**2. Zero-PV check runs on every sync**
- Move the detection body of `supabase/functions/zero-pv-check/index.ts` into `supabase/functions/_shared/zeroPvScan.ts` (open/resolve `zero_pv_incidents`, raise the `zero_pv_capacity` alert).
- Call it at the end of `ammp-sync-contract` for the synced contract, so the 10 zero-MWp sites raise an alert as soon as the sync completes. The monthly cron keeps running as a backstop and reuses the same module.
- Make the alert insert idempotent: skip if an unacknowledged `zero_pv_capacity` alert already exists for that contract with the same asset set, so repeated syncs don't pile up duplicates.
- Backfill: set `zero_pv_alert_enabled = true` on existing Elum contracts so the current 0 MWp sites are picked up on the next sync (the toggle stays per-contract editable).

**3. Legacy asset group: eConf and non-eConf in one contract**
- In the org-tier branch of `ammp-sync-contract`, replace the single legacy pseudo-org with two:
  - `Legacy asset group — with eConf` (`hasEconf: true`) for members that are **also** in the AND group (`ammp_asset_group_id_and`, e.g. `[Add-on] Remote eConf`),
  - `Legacy asset group — standard` (`hasEconf: false`) for the rest.
- Honour `ammp_asset_group_id_not` on this path too, as a pure exclusion applied to legacy members.
- Only emit a pseudo-org that actually has members, and keep the existing de-duplication against sub-orgs (sub-org wins, overlap recorded as a `elum_asset_double_count` warning).
- No pricing-engine change needed: `calculateElumOrgTierBreakdown` already applies the eConf rate per org via `org.hasEconf`, so the two legacy lines price at €65/MWp and €65 + €335/MWp respectively, and flow through to the Xero line items and support document automatically.
- `ContractForm.tsx`: for org-tier packages relabel the AND selector "eConf add-on group — legacy members in this group are billed with remote eConf" and the NOT selector "Exclude group", with a one-line note that one contract now covers both variants.

## Technical notes

- The shared mapper is a pure function over the generated `contracts` row type, so any future column added to the form has one place to register.
- `_shared/zeroPvScan.ts` takes a service-role client plus an optional contract-id filter; the cron passes no filter, the sync passes the one contract.
- Legacy pseudo-org IDs become `legacy:<groupId>:econf` and `legacy:<groupId>:base` so the org breakdown, invoice lines and asset Category column stay stable across syncs.

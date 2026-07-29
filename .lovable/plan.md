## What's going on

Both gaps in the original request are real UI gating bugs — the backend logic exists, the front end just never shows it for the new 2026 packages. Two additions have been folded in: asset category on the breakdown, and Elum alerts in the Alerts page.

**1. Hybrid legacy asset-group fallback**

The sync function already supports it: when an Elum org-tier contract also has `ammp_asset_group_id`, the group's members are pulled in as an extra "legacy asset group" pseudo-org, and assets appearing in both an org and the group are counted once (`supabase/functions/ammp-sync-contract/index.ts:489-509`).

But the Asset Group Filtering block in the contract form is gated to the old package list (`ContractForm.tsx:2997`) — the new `elum_ci_lite` / `elum_ci_pro` / `elum_utility` packages aren't in it, so the group can never be set and the hybrid path never triggers. The selectors also read `orgId` from `contractAmmpOrgId`, which org-tier contracts leave empty (they use `elumParentOrgId`).

**2. Missing sync button**

- Contract detail page: gated on `hasAMMPData = ammp_org_id || ammp_asset_group_id` (`ContractDetails.tsx:89`). An org-tier contract has neither, only `elum_parent_org_id` — button hidden.
- Contract form: "Sync from AMMP" is `disabled` unless `contractAmmpOrgId` or `ammpAssetGroupId` is set (`ContractForm.tsx:2987`).

**3. Asset category not shown**

The asset table on the contract page (`ContractDetails.tsx:1618-1673`) shows name / MW / Hybrid / Solcast / Discount / Devices — nothing about which sub-org or tier an asset belongs to, even though `cached_capabilities.orgBreakdown` holds that mapping.

**4. Elum alerts not in Alerts page**

`zero_pv_capacity` alerts are already written to `invoice_alerts` by the `zero-pv-check` function, but the Alerts page has no label or filter entry for that type, so they render with a raw type string and can't be filtered. Other Elum conditions (unassigned sub-orgs, de-duplication, Utility sites below 2 MWp, missing org breakdown, combined-minimum shortfall) are surfaced only inside the invoice calculator / support document and never become alerts.

## Changes

**Form and sync access**
1. `src/pages/ContractDetails.tsx` — include `elum_parent_org_id` and `contract_ammp_org_id` in `hasAMMPData` so "Sync AMMP" appears for org-tier contracts.
2. `src/components/contracts/ContractForm.tsx`
   - Show the Asset Group Filtering block for the new Elum org-tier packages (reuse `isElumOrgTierPackage` rather than extending the hard-coded list), labelled as the optional legacy/transition filter with a note that its assets are merged as a separate line and de-duplicated against the sub-orgs.
   - Pass `orgId = contractAmmpOrgId || elumParentOrgId` to all three `AssetGroupSelector`s.
   - Enable "Sync from AMMP" when `elumParentOrgId` is set.

**Asset category column**
3. `src/pages/ContractDetails.tsx` — build an assetId → org lookup from `cached_capabilities.orgBreakdown` and add a "Category" column to the asset table showing the sub-org name plus its tier (C&I Light / C&I Pro / Utility / Internal), or "Legacy asset group" for assets resolved that way, and "Unassigned" when neither. Show the same badge in the asset detail dialog. Non-Elum contracts keep the column hidden.

**Elum alerts**
4. `supabase/functions/ammp-sync-contract/index.ts` — after resolution, write `invoice_alerts` rows for: sub-orgs with no tier flag (`elum_org_unassigned`, warning), assets counted in both an org and the legacy group (`elum_asset_double_count`, warning), and Utility orgs containing sites below 2 MWp (`elum_utility_site_too_small`, critical — blocks Xero). Insert only when the condition is newly present for that contract, so repeated syncs don't duplicate alerts.
5. `src/lib/elumCombinedMinimum.ts` (or its caller) — raise `elum_combined_minimum_shortfall` (info) when the €80k combined annual minimum will require a true-up on the next invoice.
6. `src/components/alerts/AlertCard.tsx` and `src/components/alerts/AlertFilters.tsx` — add labels and filter entries for the new types plus the existing `zero_pv_capacity`.

No pricing-engine changes — resolution and de-duplication logic already handles the hybrid case.

# Enterprise eConf: org-driven asset resolution

Today the Enterprise eConf package resolves its billable portfolio from the **primary asset group**. Change it so the portfolio comes from the **AMMP organisation** on the contract, and the AND asset group only decides which of those assets get the eConf rate.

## New behaviour

1. Take the org ID on the contract (falls back to the customer's org ID) and pull all its assets — for NEA that is the full 99 active assets, including the 30 that sit in no group.
2. Split them into two billing segments:
   - asset is in the **AND (eConf) group** -> base rate + eConf rate (€650 + €150 per MWp/yr)
   - everything else -> base rate only (€650 per MWp/yr)
3. If a **NOT group** is configured, those assets are dropped before the split.
4. Placeholder/stub assets (no PV power and no metadata) are ignored, same rule as the Elum tier sync, and reported as "ignored placeholders".
5. Minimum annual value, onboarding fee, invoicing, support doc and Xero lines stay exactly as they are — only which assets land in which segment changes.

The primary asset group field is no longer used for this package. Existing contracts keep working: if no org ID is set, the sync falls back to the current asset-group behaviour rather than syncing zero assets.

## Where it shows

- Contract form: for Enterprise eConf the org ID becomes the primary input, the eConf (AND) and exclusion (NOT) group selectors stay, and the primary group selector is labelled as optional/legacy fallback.
- Contract details "Org resolution" panel: two rows — Standard sites and eConf upgrade sites — with asset and MWp counts, plus the ignored-placeholder count.

## Technical details

- `supabase/functions/ammp-sync-contract/index.ts`, the `enterprise_econf` branch (~line 842): replace `getAssetGroupMembers(primary)` with `getAssetsForOrg(token, orgId)`; keep the `assetOrgMap` pseudo-org split (`assetgroup:<contract>:base` / `:econf`) so downstream pricing is untouched; keep `isLegacyAssetGroup` flagging; apply the stub filter and log standard/eConf/excluded/placeholder counts. Branch condition becomes `packageType === 'enterprise_econf' && (orgId || contract.ammp_asset_group_id)`.
- Pseudo-org IDs switch to being keyed on the org (`org:<orgId>:base` / `:econf`) so they stay stable when the asset group is cleared.
- `src/components/contracts/ContractForm.tsx`: relabel the selectors for this package; no schema change (uses existing `ammp_org_id`, `ammp_asset_group_id_and`, `ammp_asset_group_id_not`).
- No database migration and no changes to `invoiceCalculations.ts`, the support document, or Xero line items.

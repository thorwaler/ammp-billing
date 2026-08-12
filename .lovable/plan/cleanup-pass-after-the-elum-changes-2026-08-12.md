# Cleanup pass after the Elum changes

An audit of everything touched in the last few days turned up two real defects and three duplication hotspots. Nothing here changes pricing behaviour — it fixes a wrong label, removes drift risk, and stops the same logic living in two places.

## 1. Alert titles always say "Contract" (real bug)

The Elum sync builds its alerts from `contract.company_name`, but that column does not exist on the contracts table — so every Elum alert falls back to the literal word "Contract" instead of naming the customer.

Fix: read the contract name and the joined customer name in the sync query and label alerts as `contract name — customer name`, falling back to whichever exists.

## 2. Asset cache type drift

The sync reads a per-asset flag (`deviceEnrichmentConfirmedEmpty`) that only the device-enrichment function declares, so the shared cache shape fails type checking and the two functions can silently drift apart.

Fix: declare the field on the cached asset type and move that shared shape into the shared folder both functions already import from.

## 3. Xero line items built twice

The single-contract invoice screen and the merged-invoice dialog each build the same Elum/module/minimum/overage line items — roughly 200 near-identical lines. They have already drifted: the single-contract version includes the MW figure in the overage description, the merged one does not.

Fix: extract one builder that both call, with an optional contract-label prefix for the merged case. Keep the single-contract wording as the canonical version so merged invoices gain the MW detail rather than losing it.

## 4. Org-classification logic duplicated between server and browser

The sync function hand-rolls its own copy of the Elum tier feature-flag map, the org classifier, and the org-scoped asset fetch, all of which already exist on the frontend side. A flag rename today needs two edits.

Fix:
- Move the tier/eConf flag constants and the org classifier into the shared edge-function folder; have the frontend import the same values so there is one source of truth.
- Add an org-scoped asset fetch to the shared AMMP client and use it from both the sync function and the browser data client.
- Rename the sync's budget-aware sub-org walker so it no longer collides by name with the simpler frontend one.

## Explicitly not changing

The legacy asset-group resolution path stays. It is still the active fallback for Elum Internal and for every non-org-tier contract, and it is wired through the contract form, contract details, and the invoice screens.

## Technical notes

- `supabase/functions/ammp-sync-contract/index.ts`: contract select (~L1801-1820) and alert call (~L1963); `CachedCapabilities.assetBreakdown` item type (~L79-101); remove local `ELUM_TIER_FLAGS`/`classifyOrgRow` (~L419-447) and `getAssetsForOrg` (~L528) in favour of shared versions; rename `getClassifiedSubOrgs` (~L473) to `getClassifiedSubOrgsWithBudget`.
- New `supabase/functions/_shared/elumFlags.ts` and `_shared/ammpTypes.ts`; extend `_shared/ammpClient.ts` with `fetchOrgAssets`.
- New `src/lib/xeroLineItems.ts` consumed by `src/components/dashboard/InvoiceCalculator.tsx` (~L1035-1463) and `src/components/invoices/MergedInvoiceDialog.tsx` (~L282-570).
- Redeploy `ammp-sync-contract` and `ammp-device-enrichment`; re-sync one Elum contract and generate one merged invoice to confirm identical output.
- No database or schema changes.

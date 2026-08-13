# Elum: internal contract flag-only, zero-capacity flags, Jubaili fixed band fee

## 1. Remove legacy asset groups from the Elum Internal contract

Today the internal contract can still pull sites from the configured AMMP asset group: as a fallback when no flagged sub-org is found, and — on the org-tier path — as the two "Legacy asset group — standard / with eConf" pseudo-organisations that appear in the support document with 6 sites and 0.000 MWp.

Change: for the internal contract, feature flags (`elum_internal`, `epm_internal`) are the only source of assets.

- No legacy asset-group fallback, and no legacy pseudo-organisations in the breakdown.
- If flag discovery returns no organisations, the sync stops with a clear warning instead of silently reverting to the asset group (no accidental empty or wrong invoice).
- The Org resolution panel states that resolution is flag-only for this contract, and lists any asset-group reference that was ignored.

Other Elum tiers keep their legacy-group behaviour unchanged.

## 2. Flag zero-MW / zero-kVA sites in every Elum support document

Sites with no usable capacity are currently invisible unless you read the totals.

- A summary line near the top of the document: total count of sites with missing or zero capacity across all sections.
- Per section, a warning block above the table: how many sites, their names, and whether they are billed at zero or excluded from billing.
- Affected rows get a visible marker in the site table ("capacity not set", "rating not set").
- Applies to PV capacity (MWp/kWp) on the org-tier, EPM, Enterprise eConf and internal sections, and to genset rating on Jubaili.
- Mirrored in the PDF output.

## 3. Jubaili: fixed fee per band, not a per-kVA rate

The bands are fixed annual fees per site, so the derived `EUR/kVA/yr` column is misleading (it shows 1.35, 0.17, 0.39 for identical fees).

- Replace the `EUR/kVA/yr` column in the per-site table with `Fee / year (EUR)` showing the band's fixed annual fee.
- The `Genset (kVA)` and `Band` columns stay as-is; the section heading keeps "genset kVA bands".
- Same change in the PDF.

## Technical notes

- `supabase/functions/ammp-sync-contract/index.ts` — in the `elum_internal` branch, drop the asset-group fallback and record `resolution: 'flag-only'`; on the org-tier path, skip building the legacy base/eConf pseudo-orgs when the contract is the internal tier. Redeploy.
- `src/pages/ContractDetails.tsx` — org resolution panel copy for flag-only internal contracts.
- `src/lib/supportDocumentGenerator.ts` — compute per-section zero-capacity lists plus a document-level total and expose them on `SupportDocumentData`.
- `src/components/invoices/SupportDocument.tsx` and `src/components/invoices/PdfRenderer.tsx` — render the warning blocks and row markers; swap the Jubaili rate column for the fixed annual fee.

No schema or pricing changes; invoice amounts are unchanged except for internal-contract assets that were only reachable through the legacy asset group.

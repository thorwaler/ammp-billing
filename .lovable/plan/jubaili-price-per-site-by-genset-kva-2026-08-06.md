# Jubaili: price per site by genset kVA

Switch the Elum Jubaili package from MW-based per-site tiers to genset-rating (kVA) bands read from the AMMP assets endpoint.

## Pricing model

Each site is billed an annual subscription based on its genset rating:

```text
9 – 134 kVA     EUR 17.50 / site / year
135 – 200 kVA   EUR 22.50 / site / year
201 – 650 kVA   EUR 32.50 / site / year
651 – 1500 kVA  EUR 37.50 / site / year
Minimum annual fee: EUR 20,000
```

These bands and the minimum are seeded as defaults but remain editable per contract in the contract form (add/remove/change bands and rates), the same way other tier tables are edited today.

## Edge cases

- **Missing rating** (`genset_capacity` null or 0): the site is not billed and is listed in the support document and contract sync panel as "unrated — kVA missing in AMMP", plus a data-quality alert so it gets fixed.
- **Out of range**: above 1500 kVA clamps to the top band, below 9 kVA clamps to the bottom band. Clamped sites raise an alert.
- **Name/value mismatch**: when the asset name or long name contains a kVA number that differs materially (>20%) from `genset_capacity`, the site is still billed on `genset_capacity` but is flagged in the alert and support document.
- **Minimum**: if the sum of band charges for the period is below the pro-rated annual minimum, the minimum applies (shown as a top-up line, as with other minimum logic).

## Support document and invoice

- Support document gains a Jubaili site table: site name, kVA, band, annual rate, charge for the period, with band subtotals and counts.
- Sections for unrated, clamped and mismatched sites appear only when such sites exist.
- Xero invoice keeps the existing single summarised Elum platform line; detail lives in the support document.

## Technical notes

- `supabase/functions/ammp-sync-contract/index.ts`: capture `genset_capacity` from `GET /v1/assets?org_ids=...` and persist `gensetKVA` (VA / 1000) on each `cached_capabilities.assetBreakdown` entry (and on the per-org asset entries). Value preserved on partial syncs like other enriched fields. Emit `jubaili_kva_data_quality` alerts for unrated / clamped / mismatched sites.
- `src/lib/invoiceCalculations.ts`: rewrite `calculateElumJubailiBreakdown` to band-based pricing — new `ElumJubailiBreakdown` shape with per-site `{ assetId, assetName, kVA, bandLabel, annualRate, cost, status }`, band subtotals, unrated/clamped lists, minimum applied. Frequency multiplier still pro-rates the annual rates.
- `src/data/pricingData.ts`: add `JUBAILI_KVA_BANDS` defaults and the EUR 20,000 minimum.
- `src/components/contracts/ContractForm.tsx`: replace the Jubaili MW tier editor with a kVA band editor (min kVA, max kVA, annual rate per site) plus annual minimum field; stored in existing contract JSON config columns — no schema change needed.
- Consumers updated for the new breakdown shape: `SupportDocument.tsx`, `PdfRenderer.tsx`, `supportDocumentGenerator.ts`, `InvoiceCalculator.tsx`, `MergedInvoiceDialog.tsx`, `UpcomingInvoicesList.tsx`, `dashboardAnalytics.ts`, `ContractDetails.tsx`.
- Existing Jubaili contracts need one resync to populate kVA before the new pricing produces values; until then the calculator shows the existing "sync required" warning.

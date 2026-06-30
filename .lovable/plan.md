## Goal
Make the Matriarch support document's per-asset breakdown actually useful instead of showing `€0.00 / 0.00 €/kWp` for every site.

## Approach
Populate per-asset pricing in `generateAssetBreakdown` for `matriarch_api` packages by mirroring the same classification used in `invoiceCalculations.ts` (irradiance-only vs performance) and assigning each row the rate that actually applies to it. The existing dual-subscription summary block stays unchanged — the per-asset table becomes its line-by-line view.

## Per-row pricing rules

- **Irradiance-only site** (passes `hasSolcast && !hasDevicesBeyondSolcast`)
  - `pricePerYear` = `irradiancePerSiteRate × 12` (e.g. €5 × 12 = €60)
  - `pricePerKWp` = 0 (flat per-site fee — not capacity-based)
  - Label/tag the row as "Irradiance" so the 0 €/kWp reads correctly
- **Performance site**
  - `pricePerKWp` = applicable graduated tier rate ÷ 1000 (use the asset's MWp position in the cumulative tier ladder, matching `calculatePerformanceMWpCost`)
  - `pricePerYear` = `pvCapacityKWp × pricePerKWp`
  - Tag the row as "Performance"

Sum of all `pricePerYear` rows will equal `matriarchApiBreakdown.totalAnnualCost`, so the existing `assetBreakdownTotal` / `Subtotal (Annual)` line reconciles automatically and the calculation-breakdown section keeps using `totalMWCost` for the period total (no change to invoice math).

## UI changes

- `SupportDocument.tsx` asset table: add a small "Model" column (or reuse the Hybrid/Hub indicators) showing `Irradiance` / `Performance` for `matriarch_api` rows so the flat €60/yr lines are self-explanatory. Keep the column hidden / unused for other packages.
- `PdfRenderer.tsx`: mirror the same extra column for Matriarch contracts only.

## Files to change

- `src/lib/supportDocumentGenerator.ts` — add a `matriarch_api` branch in `generateAssetBreakdown` (around line 749) that classifies assets, computes per-row irradiance vs performance pricing, and optionally returns a `pricingModel` tag per row. Extend the `assetBreakdown` row type with an optional `pricingModel?: 'irradiance' | 'performance'`.
- `src/components/invoices/SupportDocument.tsx` — render the model tag (only when present) in the asset table.
- `src/components/invoices/PdfRenderer.tsx` — same column in the PDF output.

## Out of scope

- No change to `invoiceCalculations.ts`, totals, or Xero line items — pricing math stays exactly as today.
- No change to the dual-subscription summary block above the asset table; it remains the authoritative tier/site-count view.

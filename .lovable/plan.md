## Issue
In the Matriarch support document, the dual-subscription block correctly splits the 42 sites into **39 irradiance-only + 3 performance**, but the "Monitoring Fee Price Breakdown" table below labels **every site as Performance**.

## Root cause
The classification is computed in two places using the same rule:
```ts
hasDevicesBeyondSolcast = (asset.deviceCount || 0) > 1
  || asset.devices?.some(d => !['solcast','satellite','irradiance'].includes(d.deviceType?.toLowerCase()))
isIrradianceOnly = asset.hasSolcast && !hasDevicesBeyondSolcast
```
- `src/lib/invoiceCalculations.ts` (≈ line 1196) produces the 39 / 3 counts shown in the dual-sub block.
- `src/lib/supportDocumentGenerator.ts` (≈ line 793) re-runs the same rule per row in the asset table.

These two calls receive slightly different asset arrays (the calculator uses `normalAssets` after discount filtering; the support doc uses the raw `ammpCapabilities.assetBreakdown`) and, more importantly, the breakdown table runs at PDF render time against whatever cached capabilities are current — which can differ from the snapshot used during invoice calculation. The result is that the row-level classification disagrees with the summary block.

In the current cached capabilities every site has `deviceCount > 1` and at least one non-satellite device, so the row-level rule marks all 42 as Performance, while the summary block (which was computed against an earlier snapshot, or different filters) reports 39 irradiance / 3 performance.

## Fix
Make the per-row classification reuse the **exact same classification** that produced the summary numbers, so the two views can never disagree.

### 1. Extend the breakdown type — `src/lib/invoiceCalculations.ts`
Add asset-ID lists to `MatriarchApiBreakdown`:
```ts
irradianceAssetIds: string[];
performanceAssetIds: string[];
```
Populate them in the matriarch branch (≈ line 1187) when partitioning `irradianceOnlySites` / `performanceSites`.

### 2. Use them in the support doc — `src/lib/supportDocumentGenerator.ts`
In the `packageType === 'matriarch_api'` branch (≈ line 781):
- If `matriarchApiBreakdown.irradianceAssetIds` / `performanceAssetIds` are present, classify each row by set membership instead of re-running the device heuristic.
- Fallback to the existing heuristic only when the arrays are missing (legacy invoices).
- Keep the existing price logic (irradiance → annual per-site rate; performance → blended €/kWp).

### 3. Propagate the arrays through `SupportDocumentData` — `src/lib/supportDocumentGenerator.ts`
Extend the `matriarchApiBreakdown` shape on `SupportDocumentData` (and the mapper at line 565) so the persisted JSON keeps the IDs. This means historical invoices regenerated from saved data also classify rows consistently.

### 4. No PDF renderer change required
`PdfRenderer.tsx` already renders `(a as any).pricingModel` (line 337), so once the generator emits the correct value the PDF picks it up automatically.

## Out of scope
- Re-deciding the underlying irradiance-vs-performance rule itself (matches `mem://features/package-matriarch-api`).
- Backfilling historical invoices' classification — they continue to use the heuristic fallback.

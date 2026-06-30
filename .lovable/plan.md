## Root cause

The Matriarch classifier in `src/lib/invoiceCalculations.ts` (lines 1201–1212) is correct:

```ts
const hasDevicesBeyondSolcast =
  (asset.deviceCount || 0) > 1 ||
  (asset.devices && asset.devices.some(d =>
    !['solcast','satellite','irradiance'].includes(d.deviceType.toLowerCase())
  ));
if (asset.hasSolcast && !hasDevicesBeyondSolcast) irradianceOnlySites.push(asset);
else performanceSites.push(asset);
```

But the two callers shape the asset list before passing it in and **drop `deviceCount` and `devices`**:

- `src/components/dashboard/InvoiceCalculator.tsx` lines 825–833 — maps only `assetId, assetName, totalMW, isHybrid, hasSolcast, solcastOnboardingDate, onboardingDate`.
- `src/components/invoices/MergedInvoiceDialog.tsx` lines 129–134 — even worse: only `assetId, assetName, totalMW, isHybrid`.

With those fields missing, `hasDevicesBeyondSolcast` evaluates to `false` for every asset, so every Solcast site is classified as irradiance-only. That gives the 39 irradiance / 3 performance result you're seeing. The 3 "performance" sites are simply the ones without Solcast (Busamed Hillcrest Private Hospital, Manhattan Plaza, Sable Square Phase 2).

Confirmed against `cached_capabilities.assetBreakdown` for the Matriarch contract — 39 sites have `pv_inverter`/`meter`/`grid`/`load` devices on top of satellite. They should all be Performance.

## Fix

### 1. `src/components/dashboard/InvoiceCalculator.tsx` (≈line 825)
Forward `deviceCount` and `devices` in the asset mapping:

```ts
const assetBreakdown = effectiveCapabilities?.assetBreakdown?.map((asset: any) => ({
  assetId: asset.assetId,
  assetName: asset.assetName,
  totalMW: asset.totalMW,
  isHybrid: asset.isHybrid,
  hasSolcast: asset.hasSolcast,
  solcastOnboardingDate: asset.solcastOnboardingDate,
  onboardingDate: asset.onboardingDate,
  deviceCount: asset.deviceCount,
  devices: asset.devices,
}));
```

### 2. `src/components/invoices/MergedInvoiceDialog.tsx` (≈line 129)
Same forward plus the Solcast fields the merged path was missing too:

```ts
const assetBreakdown = contract.cachedCapabilities?.assetBreakdown?.map((asset: any) => ({
  assetId: asset.assetId,
  assetName: asset.assetName,
  totalMW: asset.totalMW,
  isHybrid: asset.isHybrid,
  hasSolcast: asset.hasSolcast,
  solcastOnboardingDate: asset.solcastOnboardingDate,
  onboardingDate: asset.onboardingDate,
  deviceCount: asset.deviceCount,
  devices: asset.devices,
}));
```

### 3. Sanity check
Re-open the Matriarch invoice calculator and confirm the split flips to **3 irradiance / 39 performance** (the 3 being the no-Solcast sites). The asset-breakdown table in the support document will follow because it consumes the same `irradianceAssetIds` / `performanceAssetIds` arrays.

## Out of scope
No schema or pricing-logic changes — purely fixing the data the classifier receives. The longer-term "manual override per asset from the spreadsheet" can come later if you decide AMMP device topology still doesn't reflect the actual subscription for some sites.

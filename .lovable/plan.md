## What's wrong

In `src/lib/supportDocumentGenerator.ts`, `generateAssetBreakdown` has no `per_mw_annual_upfront` branch, so it falls into the default branch with `baseRatePerMWp = 0` → every asset row renders `pricePerKWp = 0` and `pricePerYear = 0`.

If we only fix that, a second inconsistency appears: the per-asset subtotal becomes ~€9,125 (7.30 MW × €1,250) but the Calculation Breakdown section keeps showing the €14,500 floor. The "Minimum Contract Adjustment" / "Total with Minimum" rows in the asset table won't render because `minimumContractAdjustment` and `minimumAnnualValue` aren't populated for this package.

## Fix (two coordinated edits, both in `src/lib/supportDocumentGenerator.ts`)

### 1. Per-asset rows use the real per-MW rate
Add a `per_mw_annual_upfront` branch in `generateAssetBreakdown` that reads `calculationResult.perMWAnnualUpfrontBreakdown.perMWpRate`:

```ts
if (packageType === 'per_mw_annual_upfront' && calculationResult.perMWAnnualUpfrontBreakdown) {
  const perMWpRate = calculationResult.perMWAnnualUpfrontBreakdown.perMWpRate;
  const pricePerKWp = perMWpRate / 1000;
  return {
    assetBreakdown: assets.map(asset => {
      const pvCapacityKWp = (asset.totalMW || 0) * 1000;
      const isHybrid = asset.isHybrid || false;
      return {
        assetId: asset.assetId,
        assetName: asset.assetName,
        pvCapacityKWp: Math.round(pvCapacityKWp * 100) / 100,
        isPV: !isHybrid,
        isHybrid,
        hubActive: selectedModules.includes('energySavingsHub'),
        portalActive: selectedModules.includes('stakeholderPortal'),
        controlActive: selectedModules.includes('control'),
        reportingActive: selectedAddons.some(a => a.id === 'reporting'),
        pricePerKWp: Math.round(pricePerKWp * 10000) / 10000,
        pricePerYear: Math.round(pvCapacityKWp * pricePerKWp * 100) / 100,
      };
    })
  };
}
```

### 2. Surface the annual floor as a minimum adjustment so the table totals match

After the calculation result is assembled (around lines 407 / 534), populate the minimum fields for this package so the existing "Minimum Contract Adjustment" + "Total with Minimum" rows render:

```ts
// per_mw_annual_upfront: treat €14,500 floor as the minimum annual value
let minimumContractAdjustment = calculationResult.minimumContractAdjustment || 0;
let effectiveMinimumAnnualValue = minimumAnnualValue;

if (packageType === 'per_mw_annual_upfront' && calculationResult.perMWAnnualUpfrontBreakdown) {
  const b = calculationResult.perMWAnnualUpfrontBreakdown;
  effectiveMinimumAnnualValue = b.annualFloor; // already max(fixed, MW-based)
  const subtotal = b.mwBasedFloor;             // = sum of per-asset annual values
  if (b.annualFloor > subtotal) {
    minimumContractAdjustment = b.annualFloor - subtotal;
  }
}
```

Pass `effectiveMinimumAnnualValue` and the adjusted `minimumContractAdjustment` into the returned `SupportDocumentData`.

## Result
Asset table for per-MW + Annual Upfront with 7.30 MW @ €1,250/MW and €14,500 floor:
- Each asset row shows its MW × rate.
- Subtotal (Annual): €9,125.00
- Minimum Contract Adjustment (Annual): €5,375.00
- Total with Minimum (Annual): €14,500.00 — matches Calculation Breakdown and invoice total.

## Out of scope
- No change to invoice/calculation math, other packages, or `SupportDocument.tsx` markup (existing minimum-adjustment rows are reused as-is).

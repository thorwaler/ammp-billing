

## Fix: Preserve Enriched Device Data During Large Re-syncs

### Root Cause
In `ammp-sync-contract/index.ts` lines 547-562, when `skipDevices = true` (>200 assets), every asset gets `devices: []`, `hasSolcast: false`, `deviceCount: 0`. The code preserves `deviceEnrichmentAttempted: true` from the previous cache, but does NOT preserve the actual device data (`devices`, `hasSolcast`, `deviceCount`, `solcastOnboardingDate`, `isHybrid`).

After re-sync, the enrichment function (line 290-291) filters by `!a.deviceEnrichmentAttempted && deviceCount === 0` — since the flag is true but data is wiped, those assets are permanently skipped.

### Fix
In the `assetBreakdown` mapping (lines 547-562), when the current sync produced empty device data (`c.deviceCount === 0`) but the existing cache has enriched device data, carry forward the existing data.

| # | File | Change |
|---|------|--------|
| 1 | `supabase/functions/ammp-sync-contract/index.ts` | In assetBreakdown mapping (~line 550), preserve `hasSolcast`, `devices`, `deviceCount`, `solcastOnboardingDate`, `isHybrid`, and `deviceEnrichmentConfirmedEmpty` from existing cached asset when current sync has empty devices and existing asset was previously enriched |

### Technical Detail

Replace lines 547-563 with logic that checks: if `c.deviceCount === 0` and the existing cached asset has `deviceEnrichmentAttempted === true` with actual device data (`devices.length > 0`), use the existing cached values for device-related fields. Also recalculate `sitesWithSolcast` (line 546) after the mapping since the preserved data changes the count.

```typescript
assetBreakdown: finalCapabilities.map(c => {
  const existingAsset = existingCached?.assetBreakdown?.find(a => a.assetId === c.assetId);
  
  // Preserve enriched device data when sync skipped devices (large portfolio)
  const hasExistingEnrichment = existingAsset?.deviceEnrichmentAttempted && 
    existingAsset?.devices && existingAsset.devices.length > 0;
  const useExisting = c.deviceCount === 0 && hasExistingEnrichment;
  
  return {
    assetId: c.assetId,
    assetName: c.assetName,
    totalMW: c.totalMW,
    capacityKWp: c.capacityKWp,
    isHybrid: useExisting ? existingAsset.isHybrid : (c.hasBattery || c.hasGenset || c.hasHybridEMS || c.hasHybridMeter),
    hasSolcast: useExisting ? existingAsset.hasSolcast : c.hasSolcast,
    deviceCount: useExisting ? existingAsset.deviceCount : c.deviceCount,
    onboardingDate: c.onboardingDate,
    solcastOnboardingDate: useExisting ? (existingAsset.solcastOnboardingDate || c.solcastOnboardingDate) : c.solcastOnboardingDate,
    devices: useExisting ? existingAsset.devices : c.devices,
    deviceEnrichmentAttempted: existingAsset?.deviceEnrichmentAttempted || false,
    deviceEnrichmentConfirmedEmpty: useExisting ? existingAsset.deviceEnrichmentConfirmedEmpty : undefined,
  };
}),
```

Then recalculate `sitesWithSolcast` from the final breakdown (move it after the mapping) so it reflects preserved Solcast data.


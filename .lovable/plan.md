

## Two Issues Found

### Issue 1: Matriarch API Package — Gaps to Fix

After reviewing the implementation, several areas need attention:

**A. `assetBreakdown` missing `deviceCount` and `devices` in `CalculationParams`**
The `CalculationParams.assetBreakdown` type (line 95-103) doesn't include `deviceCount`, `devices`, or `hasSolcast` fields. The Matriarch invoice calculation (line 1067-1078) casts to `any` to access these, but the data must actually be passed through. Need to verify:
- `UpcomingInvoicesList` passes `assetBreakdown` with these fields from `cachedCapabilities`
- `InvoiceCalculatorDialog` passes them too
- The `dashboardAnalytics.ts` ARR path passes them

**B. ARR calculation has a dead `if` block (line 277-280)**
The `matriarch_api` check at line 277 does nothing — it falls through to the generic `else if` at line 305 which calls `calculateInvoice`. This works because `calculateInvoice` handles `matriarch_api`, but only if `irradiancePerSiteTiers` and `performancePerMwpTiers` are passed. Checking line 348-349: they ARE passed, so ARR works. The dead `if` block should be removed for clarity.

**C. Invoice Calculator Dialog needs matriarch_api support**
Need to verify `InvoiceCalculatorDialog` passes the tier fields when creating invoices for matriarch_api contracts.

**D. PDF/Support Document generation**
The `pdfGenerator` and `supportDocumentGenerator` likely don't handle `matriarchApiBreakdown` — invoices will generate but won't show the dual-pricing breakdown.

### Issue 2: Solarsaver — 0 Solcast Sites (Root Cause Found)

**Root cause**: Solarsaver has **968 assets**. The sync threshold at line 418 is `> 200`, so `skipDevices = true`. When devices are skipped, `devices = []`, so `hasSolcast` is always `false` because Solcast detection requires device data (line 158-159: `d.data_provider === 'solcast' || d.device_type === 'satellite'`).

The device enrichment function is supposed to fix this, but it has a **different Solcast detection algorithm**:
- Main sync: `d.data_provider === 'solcast' || d.device_type === 'satellite'`
- Enrichment: `d.device_type === 'weather_station' && d.device_metadata?.data_provider === 'solcast'`

Additionally, the enrichment maps device fields differently (`d.device_metadata.data_provider` vs `d.data_provider`), so even after enrichment runs, Solcast might not be detected.

**Fix**: Align the enrichment function's Solcast detection with the main sync's logic. Also ensure that after a large sync completes and marks `needsDeviceEnrichment = true`, the enrichment actually runs and updates `sitesWithSolcast` in the aggregated capabilities.

---

### Plan

| # | File | Change |
|---|------|--------|
| 1 | `supabase/functions/ammp-device-enrichment/index.ts` | Fix Solcast detection to match main sync: check `d.data_provider === 'solcast' \|\| d.device_type === 'satellite'` alongside the existing `weather_station` check. Also check `d.dataProvider` from the DeviceInfo format. |
| 2 | `supabase/functions/ammp-device-enrichment/index.ts` | After enrichment updates individual assets, recalculate `sitesWithSolcast` aggregate in the cached capabilities. |
| 3 | `src/services/analytics/dashboardAnalytics.ts` | Remove dead `if (contract.package === 'matriarch_api')` block at lines 277-280 (it falls through doing nothing). |
| 4 | `src/lib/invoiceCalculations.ts` | Expand `CalculationParams.assetBreakdown` type to include `deviceCount`, `devices`, and `hasSolcast` so matriarch_api classification doesn't rely on `any` casts. |
| 5 | `src/components/invoices/InvoiceCalculatorDialog.tsx` | Ensure matriarch_api tier fields (`irradiancePerSiteTiers`, `performancePerMwpTiers`) are passed to `calculateInvoice` when the contract package is `matriarch_api`. |
| 6 | `src/lib/pdfGenerator.ts` | Add `matriarchApiBreakdown` rendering to invoice PDF (irradiance sites count + rate, performance MWp + graduated tiers). |
| 7 | `src/lib/supportDocumentGenerator.ts` | Add matriarch_api breakdown to support documents. |

### Technical Detail

**Solcast detection fix** in `ammp-device-enrichment/index.ts` (lines 116-118):
```typescript
// Current (broken for standard AMMP device format):
const hasSolcast = devices.some((d: any) => 
  d.device_type === 'weather_station' && 
  (d.device_metadata?.data_provider === 'solcast' || d.device_metadata?.driver === 'solcast')
);

// Fixed (aligned with main sync + enrichment device format):
const hasSolcast = devices.some((d: any) => 
  d.data_provider === 'solcast' || 
  d.device_type === 'satellite' ||
  (d.device_type === 'weather_station' && 
    (d.device_metadata?.data_provider === 'solcast' || d.device_metadata?.driver === 'solcast'))
);
```

After enrichment, a re-sync or manual enrichment trigger from the Solarsaver contract page should restore the ~190 Solcast sites.


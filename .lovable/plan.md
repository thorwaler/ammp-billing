## Fix: SPS support document shows €0 per site

### Cause

In `src/lib/supportDocumentGenerator.ts`, the asset-breakdown helper for the "default logic" branch only computes `baseRatePerMWp` for `pro`, `custom`, `starter`, `capped`, and `hybrid_tiered*`. For `sps_monitoring` it stays at 0, so every asset row prints `0.00 EUR/kWp` / `€0.00 EUR/Year`. The asset subtotal therefore also misleadingly becomes 0.

### Change

In `src/lib/supportDocumentGenerator.ts`:

1. **Asset rate** — in the default-logic block (~line 850), add an `sps_monitoring` case that sets:
   - `baseRatePerMWp = annualDiscountedFee / adjustedTotalMW` (post-discount blended rate, sourced from `calculationResult.spsDiscountBreakdown` and the assets' totalMW).
   - Falls back to the sum of `moduleCosts[i].rate` when the discount breakdown is missing (legacy path).
   
   Each asset row then renders real `EUR/kWp` and `EUR/Year` summing to the contract's post-discount annual fee.

2. **Period subtotal** — add an `sps_monitoring` branch in the `assetBreakdownPeriodTotal` selection (~line 475) so reconciliation matches the invoice:
   - Annual-upfront cycle → `assetBreakdownPeriodTotal = annualUpfrontAmount`.
   - Quarterly cycle → `assetBreakdownPeriodTotal = quarterCost` (full gross, no credit yet).
   - Legacy (no anchor) → fall through to current behaviour.

3. **Credit reconciliation** — when `spsAnnualUpfrontBreakdown.cycleType === 'quarterly_with_credit'`, subtract `creditApplied` from `calculatedTotal` so the support doc's "Calculated total" still matches the invoice (which already nets the credit). The credit row is already shown in `SupportDocument.tsx` (lines 657–668), so the user sees the per-site full pricing, then the prepaid credit applied below.

### Result

Asset table shows real `EUR/kWp`/`EUR/Year` per site, summing to the discounted annual SPS fee. The prepaid balance / credit applied continues to appear in the dedicated SPS billing-cycle block below the asset summary, and the totals reconcile to the actual invoice.

### Files touched

- `src/lib/supportDocumentGenerator.ts`

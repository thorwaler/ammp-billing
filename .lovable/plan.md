

# Fix Matriarch API Invoice: Remove Satellite Data API & Show Period-Adjusted Costs

## Problem
For Matriarch contracts, the invoice currently:
1. **Shows Satellite Data API as a separate addon** — this is wrong because irradiance monitoring already covers satellite data for Matriarch; it's baked into the per-site irradiance rate
2. **Shows annual totals** in the breakdown instead of period-adjusted amounts (e.g. quarterly = 3 months of the monthly rates)

## Changes (single file: `InvoiceCalculator.tsx`)

### 1. Exclude Satellite Data API addon for Matriarch contracts
In the addon initialization logic (~line 490), skip auto-activating `satelliteDataAPI` when the contract is a `matriarch_api` package. The irradiance monitoring stream already includes this cost.

Also in the addon costs section of the results display (~line 2685), filter out `satelliteDataAPI` for Matriarch contracts so it doesn't appear as a separate line item.

In the ARR/NRR calculation (~line 1254-1285), exclude the solcast addon cost for Matriarch since it's already captured in the irradiance stream.

In Xero line items (~line 1137), skip sending satelliteDataAPI as a separate line item for Matriarch.

### 2. Show period-adjusted amounts in the breakdown display
The breakdown section (~line 2364-2422) currently shows annual totals. Update it to:
- Calculate period months from billing frequency using `getPeriodMonthsMultiplier(billingFrequency)`
- Show irradiance as: `X sites × rate/site/month × N months = period total`
- Show performance as: `annual cost × (N months / 12) = period total`
- Show "Quarter Total" (or "Period Total") instead of "Combined Annual Total"
- Keep the annual figure as a reference line beneath

### 3. Xero line items already correct
The Xero line items for Matriarch (~line 1079-1102) already pro-rate by billing period — no changes needed there.

## Technical details
- Files modified: `src/components/dashboard/InvoiceCalculator.tsx`
- Key condition: `isMatriarchApiPackage(selectedCustomer.package)` used to gate satelliteDataAPI exclusion
- Period multiplier: reuse existing `getPeriodMonthsMultiplier(billingFrequency)` helper


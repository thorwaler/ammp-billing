

# Fix Matriarch API Invoice Creator Display & Xero Line Items

## Problem
The calculation engine correctly computes Matriarch API dual-stream pricing (irradiance per-site + performance per-MWp), but the InvoiceCalculator UI and Xero sync are missing Matriarch-specific handling:

1. **No result breakdown display** — after calculating, the matriarchApiBreakdown is computed but never rendered (unlike Elum, SPS, Jubaili which all have dedicated display sections)
2. **No Xero line items** — the `handleSendToXero` function doesn't create irradiance/performance line items from the matriarchApiBreakdown
3. **Modules/addons UI still shown** — the modules and addons selection panels are displayed for matriarch_api, but this package doesn't use them (similar to how SolarAfrica hides them)

## Plan

### 1. Add Matriarch API result breakdown display
In `src/components/dashboard/InvoiceCalculator.tsx`, add a new display section (after the SPS discount breakdown block ~line 2473) that renders `result.matriarchApiBreakdown`:
- Irradiance-only sites: count, rate/site/month, monthly total, annual total
- Performance sites: graduated tier breakdown table with MWp, rate, cost per tier
- Combined annual total

### 2. Add Matriarch API Xero line items
In the `handleSendToXero` function (~line 1069), add a block to create Xero line items from `matriarchApiBreakdown`:
- "Irradiance Monitoring (X sites × €Y/site/month × Z months)" → ARR account
- "Performance Monitoring (X.XX MWp)" → ARR account
- Both use `ACCOUNT_PLATFORM_FEES` since they are recurring revenue

### 3. Hide modules/addons UI for Matriarch API
Update the condition at ~line 1966 that currently only hides modules for SolarAfrica:
- Add `isMatriarchApiPackage(selectedCustomer.package)` to the hide condition
- Matriarch doesn't use standard modules/addons — its pricing is fully tier-driven

### 4. Add NRR handling for onboarding/vendor API fees
The matriarch contract stores `onboarding_setup_fee` and `vendor_api_fee` as one-time NRR. Add optional checkboxes (like SolarAfrica's "Include Setup Fee") so the user can include these on an invoice, and create corresponding Xero NRR line items.

## Files to modify
- `src/components/dashboard/InvoiceCalculator.tsx` — all four changes above


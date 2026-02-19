

## Fix Database Constraint + Refactor SolarAfrica & 2026 Invoicing Issues

### Overview
The database constraint blocking contract saves is the critical fix, but there are several additional issues with how SolarAfrica API contracts flow through the invoicing pipeline -- missing UI inputs, wrong Xero line item descriptions, and ARR/NRR misclassification. There's also dead/duplicate code in the InvoiceCalculator that should be cleaned up.

---

### Issue 1: Database CHECK Constraint (Critical -- Blocks Saving)

The `contracts` table has a `contracts_package_check` constraint that only allows 12 package values. `ammp_os_2026` and `solar_africa_api` are missing.

**Fix**: Database migration to drop and recreate the constraint with all 14 package types.

---

### Issue 2: InvoiceCalculator Missing SolarAfrica UI Inputs

The InvoiceCalculator fetches `municipalityCount`, `apiSetupFee`, and `hourlyRate` from the contract, but:
- Never passes `customizationHours` to the calculation (the param exists in `CalculationParams` but is never set)
- Never passes `includeSetupFee` (same -- param exists but never set)
- Has no UI for entering customization hours for a billing period
- Has no toggle for "Include Setup Fee" (for first invoice)
- Shows no municipality count or tier information in the calculator display

**Fix**: Add SolarAfrica-specific UI section in InvoiceCalculator:
- Show municipality count and resolved tier (read from contract)
- Add "Customization Hours" number input
- Add "Include Setup Fee" checkbox toggle
- Pass `customizationHours` and `includeSetupFee` to the calculation params

---

### Issue 3: Wrong Xero Line Item Descriptions for SolarAfrica

The calculation engine puts:
- Setup fee into `result.starterPackageCost` -- Xero shows it as "AMMP OS Starter Package" with account 1002 (ARR). Should be "Setup Costs" with account 1000 (NRR).
- Subscription tier into `result.totalMWCost` -- no dedicated Xero line item for this. Should be "Tariff API - Tier X (up to Y municipalities)" with account 1002 (ARR).
- Customization hours into `result.retainerCost` -- Xero shows as "Retainer Hours" with account 1002 (ARR). Should be "Platform Customization Work" with account 1000 (NRR).

**Fix**: Add SolarAfrica-specific Xero line item generation in the `handleSendToXero` function, similar to how trial fees and Elum packages get custom line items. Conditionally use SolarAfrica descriptions when `isSolarAfricaPackage(selectedCustomer.package)`.

---

### Issue 4: ARR/NRR Misclassification for SolarAfrica

The ARR calculation (lines 1157-1176) counts `result.starterPackageCost` as ARR, but for SolarAfrica this is the one-time setup fee (should be NRR). The actual subscription (in `result.totalMWCost`) is not explicitly captured in the ARR sum for SolarAfrica.

**Fix**: In the ARR/NRR calculation section:
- For SolarAfrica: exclude `starterPackageCost` from ARR, include it in NRR
- For SolarAfrica: add `result.totalMWCost` to ARR (tier subscription)
- For SolarAfrica: move `retainerCost` from ARR to NRR (customization hours)

---

### Issue 5: Duplicate Calculation Logic (Dead Code)

Lines 736-816 in InvoiceCalculator have a pre-calculation path for starter, hybrid_tiered, and pro/custom packages that duplicates what the shared `calculateInvoice()` function does at line 891. The shared function overwrites these results. This dead code adds confusion and maintenance burden.

**Fix**: Remove the duplicate pre-calculation block (lines 736-816). The shared `calculateInvoice()` already handles all package types correctly. Keep only the preparation of `effectiveCapabilities` and `assetBreakdown` (lines 818-830) and the shared call.

---

### Files Summary

| File | Change |
|------|--------|
| Database migration | Drop and recreate `contracts_package_check` with all 14 package types |
| `src/components/dashboard/InvoiceCalculator.tsx` | Add SolarAfrica UI inputs (customization hours, setup fee toggle, tier display); fix Xero line items for SolarAfrica; fix ARR/NRR classification; remove duplicate calculation block |


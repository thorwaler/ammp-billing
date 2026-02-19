

## Add SolarAfrica API Subscription Package

### Overview
Create a new `solar_africa_api` package type for API subscription contracts priced by the number of municipalities accessed. The municipality count is manually tracked. The package has a one-time setup fee and tiered annual pricing based on municipality count.

---

### Pricing from Contract

**Setup (one-time):**
- EUR 16,500 (includes first-year API access for up to 25 municipalities)

**Annual Subscription Tiers (by municipality count):**

| Tier | Municipalities | Annual Fee |
|------|---------------|------------|
| 1    | Up to 25      | 5,000      |
| 2    | Up to 35      | 7,000      |
| 3    | Up to 45      | 9,000      |
| 4    | Up to 55      | 11,000     |
| 5    | Up to 65      | 13,000     |

**Optional Add-on:**
- Platform Customization Work: EUR 120/hr (billed quarterly)

---

### Technical Changes

#### 1. `src/data/pricingData.ts`

- Add `solar_africa_api` to the `PackageType` union type
- Add a `MunicipalityTier` interface for the tiered pricing structure
- Add `SOLAR_AFRICA_MUNICIPALITY_TIERS` constant with the 5 tiers
- Add `SOLAR_AFRICA_SETUP_FEE` constant (16500)
- Add `SOLAR_AFRICA_ADDONS` array with "Platform Customization Work" (hourly rate, quantity-based)
- Add helper `isSolarAfricaPackage(packageType)` function

#### 2. Database: `contracts` table

- Add `municipality_count` column (integer, nullable) -- manually tracked number of municipalities
- Add `api_setup_fee` column (numeric, nullable) -- one-time setup fee for API contracts
- Add `hourly_rate` column (numeric, nullable) -- for hourly add-on billing (customization work)

#### 3. `src/components/contracts/ContractForm.tsx`

- Add "SolarAfrica API" to the package dropdown with `solar_africa_api` value
- Add package description: "API subscription priced by municipality count with tiered annual pricing"
- When `solar_africa_api` is selected:
  - Show a "Municipality Count" number input (manual entry)
  - Show the applicable tier and annual fee based on the entered count
  - Show "Setup Fee" field (defaulting to 16,500)
  - Show "Hourly Rate" field for customization work add-on (defaulting to 120)
  - Hide MW-related fields (initialMW, maxMw) since this contract is not MW-based -- or allow them to remain at 0
  - Hide standard module/addon selectors (use package-specific UI instead)
- Store `municipality_count`, `api_setup_fee`, `hourly_rate` in the contract record

#### 4. `src/lib/invoiceCalculations.ts`

- Add a `solar_africa_api` branch in the main calculation switch:
  - Look up the applicable tier from `SOLAR_AFRICA_MUNICIPALITY_TIERS` based on `municipalityCount`
  - Calculate annual subscription = tier price
  - Apply billing frequency multiplier
  - Add setup fee as NRR if applicable (first invoice only -- controlled by a flag or manual toggle in the calculator)
  - Add customization hours as NRR if provided
- Add new fields to `CalculationParams`:
  - `municipalityCount?: number`
  - `apiSetupFee?: number`
  - `hourlyRate?: number`
  - `customizationHours?: number`

#### 5. `src/components/dashboard/InvoiceCalculator.tsx`

- When a SolarAfrica API contract is selected:
  - Show municipality count (pre-filled from contract, editable for invoice)
  - Show the resolved tier and annual fee
  - Show optional "Customization Hours" input for the billing period
  - Show toggle for "Include Setup Fee" (for first invoice)
  - Pass these fields to `calculateInvoice()`
- Add Xero line items:
  - "Tariff API - Tier X (up to Y municipalities)" as ARR line item
  - "Setup Costs" as NRR line item (when included)
  - "Platform Customization Work" as NRR line item (when hours are entered)

#### 6. `src/pages/ContractDetails.tsx`

- Add "SolarAfrica API" to the package label mapping
- Display municipality count and applicable tier
- Show setup fee and hourly rate in contract summary

#### 7. `src/services/analytics/dashboardAnalytics.ts`

- Add `solar_africa_api` to package type handling
- Fetch `municipality_count` for ARR calculation
- Use tier-based pricing for ARR metrics

#### 8. Other downstream files

- `src/components/invoices/UpcomingInvoicesList.tsx` -- fetch `municipality_count` and pass to calculation
- `src/components/invoices/MergedInvoiceDialog.tsx` -- include municipality fields in merged invoice calculation

---

### Files Summary

| File | Change |
|------|--------|
| Database migration | Add `municipality_count`, `api_setup_fee`, `hourly_rate` columns to contracts |
| `src/data/pricingData.ts` | Add SolarAfrica constants, tiers, PackageType update |
| `src/components/contracts/ContractForm.tsx` | New package option, municipality count input, setup fee, hourly rate fields |
| `src/lib/invoiceCalculations.ts` | Add `solar_africa_api` calculation branch with tier lookup |
| `src/components/dashboard/InvoiceCalculator.tsx` | SolarAfrica-specific calculator UI with municipality count, customization hours |
| `src/pages/ContractDetails.tsx` | Display municipality count, tier, and SolarAfrica-specific fields |
| `src/services/analytics/dashboardAnalytics.ts` | Include `solar_africa_api` in ARR calculations |
| `src/components/invoices/UpcomingInvoicesList.tsx` | Fetch and pass municipality fields |
| `src/components/invoices/MergedInvoiceDialog.tsx` | Include municipality fields |


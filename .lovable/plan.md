

## New Package: `matriarch_api` — Dual Subscription Pricing

### Summary

Create a new pricing package for the Matriarch API contract with two simultaneous subscription components:
1. **Irradiance-only sites** — monthly per-site fee with tiered discounts
2. **Irradiance + Asset Performance sites** — annual per-MWp fee with graduated MW tiers

Site classification is derived automatically from AMMP sync data: sites with only solcast/satellite devices = irradiance-only; sites with inverters or other equipment = full performance sites.

### Pricing from Contract

**Irradiance-only (monthly, per site):**
| Sites | Rate |
|-------|------|
| 1–99 | €5.00/site/month |
| 100–499 | €4.50/site/month |
| 500–999 | €4.00/site/month |

**Irradiance + Asset Performance (annual, per MWp):**
| MWp | Rate |
|-----|------|
| 0–25 | €316/MWp/year |
| 25–75 | €300/MWp/year |
| 75–150 | €284/MWp/year |
| 150–300 | €266/MWp/year |

**One-time fees:**
- Standard onboarding: €2,650
- Vendor API integration: €350 per vendor

### Technical Plan

#### 1. Database Migration
Add new columns to `contracts` table:
- `irradiance_per_site_tiers` (jsonb, default `[]`) — tiered per-site monthly pricing
- `performance_per_mwp_tiers` (jsonb, default `[]`) — graduated MWp annual pricing  
- `vendor_api_fee` (numeric, nullable) — per-vendor integration fee
- `onboarding_setup_fee` (numeric, nullable) — one-time onboarding fee

#### 2. Pricing Data (`src/data/pricingData.ts`)
- Add `"matriarch_api"` to `PackageType` union
- Add `isMatriarchApiPackage()` helper
- Define default tier constants:
  - `MATRIARCH_IRRADIANCE_SITE_TIERS` (per-site monthly tiers)
  - `MATRIARCH_PERFORMANCE_MWP_TIERS` (per-MWp annual graduated tiers)
  - `MATRIARCH_ONBOARDING_FEE = 2650`
  - `MATRIARCH_VENDOR_API_FEE = 350`

#### 3. Contract Form (`src/components/contracts/ContractForm.tsx`)
- Fix existing `process.env` build error (replace with `import.meta.env.DEV`)
- Add `matriarch_api` package option in selector
- Add package-specific form section showing:
  - Editable irradiance site tiers (reuse `PricingTier` editor pattern)
  - Editable performance MWp tiers (reuse `GraduatedMWTier` editor pattern)
  - Onboarding fee and vendor API fee inputs
- Auto-detect from AMMP sync: sites where `devices` only contain solcast/satellite = irradiance-only; sites with inverters etc. = performance sites
- Save tiers to `irradiance_per_site_tiers` and `performance_per_mwp_tiers` columns

#### 4. Invoice Calculation (`src/lib/invoiceCalculations.ts`)
Add `matriarch_api` branch:
- From `assetBreakdown`, classify each site:
  - **Irradiance-only**: site has `hasSolcast === true` and `deviceCount <= 1` (or only satellite devices)
  - **Performance**: site has inverters/other devices beyond solcast
- Calculate irradiance component: count irradiance-only sites → apply tiered per-site rate → annualize (×12) → apply frequency multiplier
- Calculate performance component: sum MWp of performance sites → apply graduated tier pricing → apply frequency multiplier
- Sum both as `totalMWCost`

#### 5. Dashboard Analytics (`src/services/analytics/dashboardAnalytics.ts`)
- Add `matriarch_api` ARR calculation branch using same dual-component logic

#### 6. Contract Details Page (`src/pages/ContractDetails.tsx`)
- Add display label for `matriarch_api`
- Show irradiance site count and performance MWp breakdown

#### 7. Upcoming Invoices & Revenue Forecasting
- Ensure `matriarch_api` contracts propagate `irradiance_per_site_tiers`, `performance_per_mwp_tiers`, and fee fields through invoice estimation

### Files Changed

| File | Change |
|------|--------|
| DB migration | Add 4 new columns to `contracts` table |
| `src/data/pricingData.ts` | Add package type, tier constants, helpers |
| `src/components/contracts/ContractForm.tsx` | Fix `process.env` error; add package option + form section |
| `src/lib/invoiceCalculations.ts` | Add dual-component calculation for `matriarch_api` |
| `src/services/analytics/dashboardAnalytics.ts` | Add ARR calculation branch |
| `src/pages/ContractDetails.tsx` | Add display label and field rendering |
| `src/components/invoices/UpcomingInvoicesList.tsx` | Propagate new fields |


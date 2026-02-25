

## New SPS Monitoring Package

After analyzing the signed SPS Monitoring Agreement, here is the pricing structure I extracted and the implementation plan.

### Contract Summary (from PDF)

**Base Monitoring**: €900/MWp/year (Technical Monitoring)
**Trial Modules**: Energy Savings Hub (€0 trial / €450/MWp after), Stakeholder Portal (€0 trial / €225/MWp after)
**Minimum Annual Value**: €100,000 -- charged upfront; if calculated fees are below this, no additional revenue is invoiced
**Three stacking discounts on monitoring fee**:
1. **Upfront Discount (5%)** -- for paying annual fee upfront for existing portfolio
2. **Commitment Discount (3%)** -- 3-year initial term commitment
3. **Volume Discount** -- 5% per full 50 MWp under management, up to 30% max

**One-time fees**: Standard Onboarding €0 (waived), Vendor API Onboarding €350/vendor, Custom API Integration €3,150/vendor
**Add-ons**: Platform Customization €110/hr, Custom Dashboards €900, Custom Reports €1,350, Custom Alerts €135, Satellite API €2.7/site/month
**Billing**: Annual upfront for existing portfolio, quarterly for additional capacity
**Currency**: EUR
**Term**: 3 years with auto-renewal

### Technical Details

This requires a new built-in package type because the three stacking percentage discounts on the monitoring fee are not supported by any existing package. The discounts must be applied before comparing against the minimum annual value.

```text
Calculation Flow:
  Base Cost = totalMW × moduleRate × frequencyMultiplier
  → Apply Volume Discount (from portfolio_discount_tiers)
  → Apply Upfront Discount (5%)
  → Apply Commitment Discount (3%)
  = Discounted Monitoring Fee
  → Compare with Minimum Annual Value (€100,000)
  → Use the greater of the two
  + Add-ons + One-time fees
  = Total Invoice
```

### Changes Required

#### 1. Database Migration
Add two new columns to `contracts` table:
- `upfront_discount_percent` (numeric, nullable, default null)
- `commitment_discount_percent` (numeric, nullable, default null)

#### 2. `src/data/pricingData.ts`
- Add `"sps_monitoring"` to the `PackageType` union
- Add `isSpsPackage()` helper function
- Add SPS-specific add-on definitions with adjusted prices (Custom Dashboards €900 instead of €1,000, Custom Reports €1,350 instead of €1,500, Custom Alerts €135 instead of €150, Platform Customization Work €110/hr)

#### 3. `src/lib/invoiceCalculations.ts`
- Add `upfrontDiscountPercent` and `commitmentDiscountPercent` to `CalculationParams`
- Add discount breakdown fields to `CalculationResult` (volumeDiscount, upfrontDiscount, commitmentDiscount amounts, and pre-discount base cost)
- Add `sps_monitoring` branch in `calculateInvoice()`:
  1. Calculate module costs using standard `calculateModuleCosts()` (same as pro)
  2. Apply volume discount from `portfolioDiscountTiers` using existing `getApplicableDiscount()`
  3. Apply upfront discount percentage
  4. Apply commitment discount percentage
  5. Compare discounted total against minimum annual value
- Add `sps_monitoring` to the minimum annual value comparison check (line 1028)

#### 4. `src/components/contracts/ContractForm.tsx`
- Add `<SelectItem value="sps_monitoring">` to package dropdown with description
- Add `handlePackageChange` branch for `sps_monitoring`:
  - Set default modules to `["technicalMonitoring"]`
  - Set `minimumAnnualValue` to 100000
  - Set `billingFrequency` to "annual"
  - Set default `portfolioDiscountTiers` for SPS volume discount (0%/5%/10%/15%/20%/25%/30% at 50 MW steps)
  - Set default upfront discount to 5% and commitment discount to 3%
  - Enable custom pricing
- Add SPS-specific UI section (like SolarAfrica's) showing:
  - Upfront Discount % input
  - Commitment Discount % input
  - Volume discount tiers (reuse existing `DiscountTierEditor`)
- Add schema fields for `upfrontDiscountPercent` and `commitmentDiscountPercent`
- Save new fields to contract payload

#### 5. `src/components/dashboard/InvoiceCalculator.tsx`
- Load `upfront_discount_percent` and `commitment_discount_percent` from contract data
- Pass them to `calculateInvoice()` params
- Display discount breakdown in the cost summary (volume discount, upfront discount, commitment discount as separate line items)
- Add `sps_monitoring` to the package handling logic

#### 6. `src/services/analytics/dashboardAnalytics.ts`
- Add `upfront_discount_percent` and `commitment_discount_percent` to the contract select query
- Pass them to `calculateSingleContractARR()` interface and through to `calculateInvoice()`
- The `sps_monitoring` package will follow the same `else` branch as pro/custom since it uses module-based pricing

#### 7. Other Integration Points
- **`src/components/invoices/UpcomingInvoicesList.tsx`**: Fetch and pass discount fields
- **`src/components/invoices/MergedInvoiceDialog.tsx`**: Fetch and pass discount fields
- **Revenue forecasting** (in `dashboardAnalytics.ts`): Include `sps_monitoring` in the forecast loop, pass discount fields
- **Support document generation**: Show discount breakdown in the support document
- **Xero line items**: Map discounted monitoring fee to account 1002 (ARR), one-time fees to 1000 (NRR)

### Files Changed

| File | Change |
|------|--------|
| Database migration | Add `upfront_discount_percent`, `commitment_discount_percent` to contracts |
| `src/data/pricingData.ts` | Add `sps_monitoring` package type, SPS add-on definitions, helper |
| `src/lib/invoiceCalculations.ts` | Add discount params/results, SPS calculation branch with 3 stacking discounts |
| `src/components/contracts/ContractForm.tsx` | Add SPS package option, discount inputs, defaults, save logic |
| `src/components/dashboard/InvoiceCalculator.tsx` | Load and pass discount fields, display discount breakdown |
| `src/services/analytics/dashboardAnalytics.ts` | Fetch and pass discount fields for ARR calculations |
| `src/components/invoices/UpcomingInvoicesList.tsx` | Fetch and pass discount fields |
| `src/components/invoices/MergedInvoiceDialog.tsx` | Fetch and pass discount fields |
| `src/lib/supportDocumentGenerator.ts` | Include discount breakdown in support documents |


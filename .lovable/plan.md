

## Add AMMP OS 2026 Contract Package

### Overview
Add a new `ammp_os_2026` contract package type with the full 2026 pricing structure: 5 new modules, updated add-ons, trial toggle, and portfolio discount tiers. Existing packages remain unchanged for legacy contracts.

---

### 2026 Pricing Summary

**Modules (per MWp/year):**

| Module | Price | Notes |
|--------|-------|-------|
| Smart Alerting | 400/MWp/year | Mutually exclusive with Live Monitoring |
| Live Monitoring and Alerting | 600/MWp/year | Mutually exclusive with Smart Alerting |
| Performance Monitoring and Reporting | 600/MWp/year | |
| Financial Reporting | 300/MWp/year | |
| Data API | 100/MWp/year | |

**Add-ons (one-time fees):**

| Add-on | Price | Notes |
|--------|-------|-------|
| Data Logger Setup | 1,200 - 5,000/site | Complexity-based (low/medium/high) |
| Custom Dashboard / Report / 10 Alerts | 1,500 | Single add-on with sub-selector for deliverable type |
| Custom KPI Development | 200 - 10,000 | Complexity-based (low/medium/high) |
| Custom API Development | 4,000 | One-time fixed price |

**Trial toggle (within package):**
- Setup fee: 3,200 (one-time)
- Module subscription: 50% off
- Vendor API Onboarding: 400

---

### Technical Changes

#### 1. Database Migration
Add three columns to `contracts` table:
- `is_trial` (boolean, default false)
- `trial_setup_fee` (numeric, nullable)
- `vendor_api_onboarding_fee` (numeric, nullable)

#### 2. `src/data/pricingData.ts`
- Add `ammp_os_2026` to the `PackageType` union
- Add `MODULES_2026` array with the 5 modules above
- Add `ADDONS_2026` array:
  - `dataLoggerSetup2026` -- complexity pricing: 1200 / 3000 / 5000
  - `customDashboardReportAlerts` -- fixed 1,500 with a `deliverableType` sub-option (dashboard / report / 10 alerts)
  - `customKPIs2026` -- complexity pricing: 200 / 1500 / 10000
  - `customAPIDevelopment` -- fixed 4,000
- Add `DeliverableType` type: `"dashboard" | "report" | "10_alerts"`
- Add `TRIAL_2026` constant: `{ setupFee: 3200, moduleDiscount: 0.5, vendorApiOnboardingFee: 400 }`
- Add helper: `isPackage2026(packageType)` to check if the 2026 module/addon sets apply

#### 3. `src/components/contracts/ContractForm.tsx`
- Add "AMMP OS 2026" to the package dropdown
- Add package description text
- When `ammp_os_2026` is selected:
  - Show a "Trial" checkbox; when enabled, display the trial fees summary
  - Pass `MODULES_2026` and `ADDONS_2026` to the package selector instead of legacy arrays
- Store `is_trial`, `trial_setup_fee`, `vendor_api_onboarding_fee` in the contract record
- Add `addon_deliverable_types` to the addons JSON metadata (for the custom dashboard/report/alerts sub-selector)

#### 4. `src/components/contracts/ContractPackageSelector.tsx`
- Accept props for which module/addon arrays to display (legacy vs 2026)
- Add mutual exclusivity logic: selecting "Smart Alerting" disables "Live Monitoring and Alerting" and vice versa, with a visual indicator
- For the `customDashboardReportAlerts` add-on: render a radio group sub-selector (Dashboard / Report / 10 Alerts) when the add-on is checked
- Add a callback prop `onDeliverableTypeChange` to pass the selected sub-type back to the form

#### 5. `src/lib/invoiceCalculations.ts`
- When `packageType === "ammp_os_2026"`: look up modules from `MODULES_2026`, add-ons from `ADDONS_2026`
- If `is_trial` flag is set: apply 50% discount to module costs, add trial setup fee and vendor API onboarding fee as one-time NRR charges
- Existing calculation flow (module costs + addon costs + minimum annual value) stays the same

#### 6. Other files
- `src/services/analytics/dashboardAnalytics.ts` -- include `ammp_os_2026` in package type checks for revenue/MW metrics
- Invoice calculator and Xero line items -- use the correct module/addon sets based on contract package type

---

### Files Summary

| File | Change |
|------|--------|
| Database migration | Add `is_trial`, `trial_setup_fee`, `vendor_api_onboarding_fee` columns |
| `src/data/pricingData.ts` | Add MODULES_2026, ADDONS_2026, TRIAL_2026, DeliverableType, helper functions |
| `src/components/contracts/ContractForm.tsx` | New package option, trial toggle, pass 2026 arrays |
| `src/components/contracts/ContractPackageSelector.tsx` | Support 2026 arrays, mutual exclusivity, deliverable type sub-selector |
| `src/lib/invoiceCalculations.ts` | Handle ammp_os_2026 in cost calculations, trial pricing |
| `src/services/analytics/dashboardAnalytics.ts` | Add ammp_os_2026 to package type handling |


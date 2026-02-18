

## Gaps and Refactoring for AMMP OS 2026 Invoicing Compatibility

### Overview
Several invoicing-related components were not updated when the `ammp_os_2026` package was added. The core calculation engine (`invoiceCalculations.ts`) is correct, but the data pipeline feeding it from various UI entry points is missing trial fields, and some display/analytics components are unaware of the new package.

---

### Gap 1: InvoiceCalculator does not pass trial fields

**File**: `src/components/dashboard/InvoiceCalculator.tsx`

The `Customer` interface (line ~96) and the contract query (line ~216) do not fetch `is_trial`, `trial_setup_fee`, or `vendor_api_onboarding_fee` from the contracts table. When an AMMP OS 2026 trial contract is selected, the calculation runs without the trial discount and fees.

**Fix**:
- Add `isTrial`, `trialSetupFee`, `vendorApiOnboardingFee` to the `Customer` interface
- Add `is_trial`, `trial_setup_fee`, `vendor_api_onboarding_fee` to the contracts query
- Map these fields in the customer transformation
- Pass them into `calculateInvoice()` call
- Add trial fee Xero line items (NRR) when trial is active
- Include trial fees in NRR amount calculation

---

### Gap 2: InvoiceCalculator uses only legacy module/addon arrays

**File**: `src/components/dashboard/InvoiceCalculator.tsx`

Lines 147-148 hardcode `MODULES` and `ADDONS` as the default arrays. When a 2026 contract is selected, the UI still shows legacy modules/addons instead of `MODULES_2026`/`ADDONS_2026`.

**Fix**:
- Import `MODULES_2026`, `ADDONS_2026`, `isPackage2026` from pricingData
- When the selected customer's package is `ammp_os_2026`, use `MODULES_2026` and `ADDONS_2026` for the module/addon state
- Add mutual exclusivity logic for Smart Alerting vs Live Monitoring in the calculator UI

---

### Gap 3: UpcomingInvoicesList does not pass trial fields

**File**: `src/components/invoices/UpcomingInvoicesList.tsx`

The contracts query (line ~80) and `UpcomingInvoice` interface do not include `is_trial`, `trial_setup_fee`, or `vendor_api_onboarding_fee`. The `calculateEstimatedAmount` function therefore never applies trial pricing.

**Fix**:
- Add `isTrial`, `trialSetupFee`, `vendorApiOnboardingFee` to the `UpcomingInvoice` interface
- Add these columns to the contracts query
- Map them in the transformation
- Pass them to `calculateInvoice()` in `calculateEstimatedAmount()`

---

### Gap 4: MergedInvoiceDialog does not pass trial fields

**File**: `src/components/invoices/MergedInvoiceDialog.tsx`

The `ContractForMerge` interface (line ~20) lacks trial fields. Merged invoices for 2026 trial contracts will calculate without the 50% discount and trial fees.

**Fix**:
- Add `isTrial`, `trialSetupFee`, `vendorApiOnboardingFee` to `ContractForMerge` interface
- Pass these to `calculateInvoice()` when computing per-contract results
- Add trial fee Xero line items

---

### Gap 5: dashboardAnalytics ARR does not pass trial fields

**File**: `src/services/analytics/dashboardAnalytics.ts`

`calculateSingleContractARR` (line ~228) and `calculateTotalARR` (line ~335) do not fetch or pass `is_trial`, `trial_setup_fee`, or `vendor_api_onboarding_fee`. ARR calculations for trial contracts will be wrong (no 50% discount applied).

**Fix**:
- Add trial fields to the `calculateSingleContractARR` interface
- Add them to the contracts query in `calculateTotalARR`
- Pass them through to `calculateInvoice()`

---

### Gap 6: ContractForm does not load trial state when editing

**File**: `src/components/contracts/ContractForm.tsx`

The `existingContract` interface (line ~139) has no `isTrial`, `trialSetupFee`, or `vendorApiOnboardingFee` fields. When editing an existing 2026 trial contract, the trial toggle will default to off.

**Fix**:
- Add `isTrial`, `trialSetupFee`, `vendorApiOnboardingFee` to the `existingContract` interface
- Initialize `isTrial` state from `existingContract.isTrial` in the useEffect
- Set form default value for `isTrial` from existing contract

---

### Gap 7: ContractDetails page does not display 2026 module names or trial status

**File**: `src/pages/ContractDetails.tsx`

The `moduleNames` mapping (line ~23) only has the 4 legacy modules. AMMP OS 2026 module IDs will show as raw IDs. The `addonNames` mapping (line ~31) also lacks 2026 addon names. No trial badge is shown.

**Fix**:
- Add 2026 module names to `moduleNames` mapping
- Add 2026 addon names to `addonNames` mapping
- Show a "Trial" badge when `contract.is_trial` is true
- Display trial fees in the contract details summary

---

### Gap 8: Xero line items for trial fees

**File**: `src/components/dashboard/InvoiceCalculator.tsx` (line ~900+)

When building Xero line items, there is no line item for trial setup fee or vendor API onboarding fee. These one-time NRR charges need to appear on the Xero invoice.

**Fix**:
- After building standard line items, check if the contract is a 2026 trial
- Add "Trial Setup Fee" line item (account 1000 - NRR)
- Add "Vendor API Onboarding Fee" line item (account 1000 - NRR)

---

### Summary of Files to Modify

| File | Changes |
|------|---------|
| `src/components/dashboard/InvoiceCalculator.tsx` | Fetch trial fields, use 2026 modules/addons, add trial Xero line items, mutual exclusivity |
| `src/components/invoices/UpcomingInvoicesList.tsx` | Fetch and pass trial fields to calculation |
| `src/components/invoices/MergedInvoiceDialog.tsx` | Add trial fields to interface and calculation |
| `src/services/analytics/dashboardAnalytics.ts` | Fetch and pass trial fields for ARR calculation |
| `src/components/contracts/ContractForm.tsx` | Load trial state when editing existing contracts |
| `src/pages/ContractDetails.tsx` | Add 2026 module/addon names, show trial badge and fees |


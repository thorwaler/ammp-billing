

## Fix Per-Site Contract Billing Frequency Handling

### Problem

Per-site contracts are designed to always use monthly billing (they appear every month to capture site onboarding fees and annual renewals). However:

1. The billing frequency is only set to "monthly" when you **first select** the per_site package in the dropdown. If the contract is later edited, the form loads whatever value is in the database -- and there's no dropdown to change it back.
2. The UNHCR contract currently has `billing_frequency = 'annual'` in the database, which needs to be corrected.

### Fix

#### 1. Force monthly on save for per_site contracts

In `src/components/contracts/ContractForm.tsx`, in the `onSubmit` handler, force `billing_frequency` to `'monthly'` whenever the package is `per_site`. This ensures that even if the value somehow drifts, it's always corrected on save.

#### 2. Force monthly when loading an existing per_site contract

In the `loadContractData` function (around line 456), after setting `billingFrequency` from the database, add a check: if the loaded package is `per_site`, override `billingFrequency` to `'monthly'`.

#### 3. Fix UNHCR contract data

Database update to set the UNHCR contract back to monthly with correct period dates:

```text
Contract: 533f9659-245b-4dd7-9ce1-e09139de78ef
  billing_frequency: 'annual' -> 'monthly'
  period_start: '2026-02-01'
  period_end: '2026-02-28'
```

### Files Summary

| File | Change |
|------|--------|
| `src/components/contracts/ContractForm.tsx` | Force `billing_frequency = 'monthly'` on save and on load for per_site contracts |
| Database update (data fix) | Set UNHCR contract to monthly with corrected period dates |


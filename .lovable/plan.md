# Fix: annual minimum adjustment must count custom annual fees

## Problem

When a contract has a minimum annual value (Pro, Custom, AMMP OS 2026, Elum packages, Enterprise eConf, ePM), the invoice calculator checks whether the period's base charge reaches the minimum and adds a top-up adjustment if it doesn't. That check currently runs **before** the new custom annual fees are counted, so a contract whose fees already cover the minimum still gets an unnecessary adjustment — the customer is charged the fee **plus** a top-up.

## Fix

In `src/lib/invoiceCalculations.ts`, inside the minimum-annual-value adjustment block:

1. Sum the custom recurring fees for the period (`annualAmount × billing-frequency multiplier`) using the existing `calculateCustomRecurringAddonCosts` output.
2. Compare `baseCost + customFeesPeriodTotal` against the period minimum instead of just `baseCost`.
3. Adjustment = `max(0, periodMinimum − (baseCost + customFeesPeriodTotal))`; the fee itself stays as its own invoice line, only the top-up shrinks or disappears.

## Also covered

- Invoice estimates (upcoming invoices list) and revisions both reuse the same calculator, so they pick up the fix automatically.
- The Xero line-item description for the adjustment continues to work unchanged (it reads the resulting adjustment value).
- Update the feature memory note for custom annual fees to record that they count toward the annual minimum.

## Verification

- TypeScript check passes and preview build reports OK.
- Sanity-check one contract with a minimum annual value: fee ≥ minimum → no adjustment line; fee < minimum → adjustment only for the remaining gap.

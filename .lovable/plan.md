

# Fix Hardcoded Currency Symbols in Matriarch Invoice Display

## Problem
The Matriarch contract can be in EUR or USD, but several places in the InvoiceCalculator have hardcoded `€` symbols instead of using the contract's currency. This affects:

1. **Matriarch NRR checkbox labels** (lines 2001, 2011) — "Include Onboarding Fee (€2,650)" always shows €
2. **Xero line item description** (line 1084) — "Irradiance Monitoring (X sites × €Y/site/month)" always uses €
3. **Other non-Matriarch sections** also hardcode € (addon pricing, module pricing, SolarAfrica setup fee) — these are a broader issue but may also affect Matriarch if contracts share UI paths

## Plan

### 1. Use `formatContractCurrency` or a currency symbol helper in Matriarch-specific UI
Replace hardcoded `€` with a dynamic symbol derived from `selectedCustomer?.currency`:
- Line 2001: `Include Onboarding Fee (€{...})` → use contract currency symbol
- Line 2011: `Include Vendor API Fee (€{...})` → use contract currency symbol

### 2. Fix Xero line item description for Matriarch
- Line 1084: Replace `€${mb.irradiancePerSiteRate}` with the correct symbol based on `selectedCustomer.currency`

### 3. Add a small currency symbol helper
Extract a simple `currencySymbol` variable (e.g. `const currencySymbol = selectedCustomer?.currency === 'USD' ? '$' : '€'`) so all display strings can reference it consistently. The `formatContractCurrency` function already exists for formatted amounts — this is just for inline symbol usage in description strings.

### 4. Broader hardcoded € cleanup (optional but recommended)
The same issue exists in the addon/module pricing display (lines 2093, 2122, 2143-2145, 2165, 2178, 2218, 2222). These should also use the contract currency. This is a pre-existing issue not specific to Matriarch but worth fixing in the same pass.

## Files to modify
- `src/components/dashboard/InvoiceCalculator.tsx` — replace all hardcoded `€` with dynamic currency symbol


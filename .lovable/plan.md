## Fix: per-MW + Annual Upfront fields don't save for custom Contract Types

### Root cause

The annual-upfront UI section and save mapping are gated on the literal package slug:

```
{watchPackage === "per_mw_annual_upfront" && (...) }   // line 1381
annual_minimum_fee: data.package === 'per_mw_annual_upfront' ? ... : null   // line 1106
billing_frequency: ... data.package === 'per_mw_annual_upfront' ? 'quarterly' : ...   // line 1027
```

SolarX is configured as a **custom Contract Type** whose `pricing_model = 'per_mw_annual_upfront'`. On those contracts, `data.package` is the custom slug (e.g. `"solarx-..."`), not the literal `'per_mw_annual_upfront'`. Every gate above evaluates false → the fields are neither shown nor saved.

Same issue exists for `per_mw_modules` (line 800 checks the custom type's `pricing_model`, but the annual-upfront block doesn't), and for `ContractTypeForm.showModulesFor` (already covered, fine).

### Fix

Add a single derived boolean used by both the UI section and save mapping:

```ts
const selectedContractType = customContractTypes.find((ct: any) => ct.id === selectedContractTypeId);
const isAnnualUpfront =
  watchPackage === 'per_mw_annual_upfront' ||
  selectedContractType?.pricing_model === 'per_mw_annual_upfront';
```

Then:

1. **UI gate** (line 1381): replace `watchPackage === "per_mw_annual_upfront"` with `isAnnualUpfront`.
2. **Save: billing_frequency** (line 1027): use `isAnnualUpfront ? 'quarterly' : data.billingFrequency` instead of the slug check.
3. **Save: annual_minimum_fee / committed_minimum_mw / annual_billing_anchor_date** (lines 1102–1104): gate on `isAnnualUpfront` instead of the slug.
4. **Edit hydration**: when an existing contract loads with a custom type, the `handlePackageChange` path doesn't seed the three annual-upfront form values (only the literal-package branch does). The `defaultValues` block on the form (lines 327–329) already seeds them from `existingContract`, so this should work as-is — but verify and, if needed, also seed them inside the custom-type branch around line 798 when `customType.pricing_model === 'per_mw_annual_upfront'`.

### Downstream check

`InvoiceCalculator.tsx` line 1365 also gates on `selectedCustomer.package === 'per_mw_annual_upfront'`. For custom-type contracts the calculator needs the contract's `pricing_model` too. Two options:

- **A. Cheaper**: pass `pricing_model` through `selectedCustomer` (it already loads via the customer/contract fetch); compare against both. Requires checking that the SelectedCustomer object carries the contract type.
- **B. More robust**: in the per-MW-annual-upfront DB-update branch, key off the **contract row itself** — read `pricing_model` (via `contract_types` join) when fetching `annual_billing_anchor_date`, and run the dual-cadence path when either the package slug or the joined pricing_model matches.

Recommend **B** since it works regardless of how `selectedCustomer` was assembled.

### Out of scope

- No DB migration needed (fields already exist).
- No change to `invoiceCalculations.ts` — it already keys off `packageType === 'per_mw_annual_upfront'`; we'll pass that effective type from callers in a follow-up if needed for custom types in preview calculations.

### Files to touch

- `src/components/contracts/ContractForm.tsx` — derive `isAnnualUpfront`, replace 4 gates.
- `src/components/dashboard/InvoiceCalculator.tsx` — fetch `contract_types.pricing_model` alongside anchor date, treat as annual-upfront when either matches.
- `src/components/invoices/UpcomingInvoicesList.tsx` — same: when computing `perMWAnnualUpfrontIsAnnualCycle` and passing fields to `calculateInvoice`, also treat contracts whose joined `contract_types.pricing_model` is `per_mw_annual_upfront` as the new package. Add `contract_types(pricing_model)` to the select.

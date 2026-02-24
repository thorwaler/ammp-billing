

## Phase 2-4: Custom Contract Types Integration

### Phase 2: Contract Form Integration

**Goal**: Custom contract types appear in the package dropdown and auto-populate form fields when selected.

#### `src/components/contracts/ContractForm.tsx`

1. **Relax the `package` zod schema** (line 80): Change from `z.enum([...])` to `z.string().min(1)` so custom slugs are accepted.

2. **Fetch custom contract types**: Add a `useQuery` call to load active contract types from the `contract_types` table.

3. **Add custom types to package dropdown** (around line 1100): After the existing `<SelectItem>` entries, add a `<Separator>` and dynamically render `<SelectItem>` for each active custom contract type, using the slug as the value and name + description as the label.

4. **Extend `handlePackageChange`** (line 620): Add an `else` branch that checks if the selected value matches a custom contract type slug. If so:
   - Load the template's `modules_config` into form modules
   - Set `billingFrequency` from template defaults (and lock it if `force_billing_frequency` is true)
   - Set `currency`, `minimumAnnualValue` from template defaults
   - Set `showCustomPricing` based on pricing model
   - Store the `contract_type_id` for saving

5. **Save `contract_type_id`** in `onSubmit` (line 902): Add `contract_type_id` to the contract data payload when a custom type is selected.

#### Files changed:
| File | Change |
|------|--------|
| `src/components/contracts/ContractForm.tsx` | Relax package schema, fetch custom types, render in dropdown, handle selection, save contract_type_id |

---

### Phase 3: Invoice Calculation Integration

**Goal**: The calculation engine uses custom module/addon definitions from templates instead of hardcoded arrays.

#### `src/lib/invoiceCalculations.ts`

1. **Add optional `customModuleDefinitions` and `customAddonDefinitions` to `CalculationParams`**: These are arrays matching `ModuleDefinition[]` and `AddonDefinition[]` interfaces from pricingData.

2. **Update `calculateModuleCosts`** (line 311): Instead of always using `MODULES` or `MODULES_2026`, check if `customModuleDefinitions` is provided and use that as the module list.

3. **Update `calculateAddonCosts`** (line 384): Instead of always looking up from `ADDONS`/`ADDONS_2026`, check if `customAddonDefinitions` is provided and use that as the lookup source.

4. **Update the `else` branch in `calculateInvoice`** (line 951): For custom contract types using `per_mw_modules` pricing model, the existing pro/custom code path already works -- it just needs to use the custom module list instead of the hardcoded one.

#### `src/components/dashboard/InvoiceCalculator.tsx`

1. **Fetch contract type when loading contract data**: When loading a contract that has `contract_type_id`, fetch the associated contract type template.

2. **Pass custom module/addon definitions to `calculateInvoice`**: Add `customModuleDefinitions` and `customAddonDefinitions` from the loaded template to the calculation params.

3. **Use custom modules/addons for UI display**: When displaying module/addon selectors for a custom-type contract, use the template's definitions instead of the hardcoded `MODULES`/`ADDONS`.

#### `src/components/contracts/ContractPackageSelector.tsx`

Already supports `modules` and `addons` props (lines 56-57), so no changes needed -- just pass the custom definitions from the template.

#### Files changed:
| File | Change |
|------|--------|
| `src/lib/invoiceCalculations.ts` | Add custom module/addon params; use them in calculateModuleCosts and calculateAddonCosts |
| `src/components/dashboard/InvoiceCalculator.tsx` | Fetch template for custom-type contracts; pass custom definitions to calculation and UI |

---

### Phase 4: Xero Line Item Integration

**Goal**: Custom Xero line item descriptions and account codes from the template override defaults.

#### `src/components/dashboard/InvoiceCalculator.tsx`

1. **Apply custom Xero mapping from template**: When building the `lineItems` array for Xero (around lines 1000-1110), check if the contract has a loaded template with `xero_line_items_config`. If so:
   - Use custom descriptions for module line items (e.g., "Partner X - Monitoring Fee" instead of generic)
   - Use custom account codes from the template (defaulting to 1002 for ARR components and 1000 for NRR)
   - Apply custom descriptions for addon line items

2. **Fallback behavior**: If `xero_line_items_config` is empty or missing, use the existing default descriptions and account codes (no change to current behavior).

#### Structure of `xero_line_items_config`:
```text
{
  "modules": {
    "description": "Custom description for module line items",
    "accountCode": "1002"
  },
  "addons": {
    "description": "Custom description for addon line items", 
    "accountCode": "1000"
  },
  "basePrice": {
    "description": "Custom description for base pricing",
    "accountCode": "1002"
  }
}
```

#### Files changed:
| File | Change |
|------|--------|
| `src/components/dashboard/InvoiceCalculator.tsx` | Apply custom Xero descriptions and account codes from template config |

---

### Summary of All Changes

| Phase | File | Change |
|-------|------|--------|
| 2 | `src/components/contracts/ContractForm.tsx` | Custom types in dropdown, auto-populate defaults, save contract_type_id |
| 3 | `src/lib/invoiceCalculations.ts` | Accept custom module/addon definitions in calculation params |
| 3 | `src/components/dashboard/InvoiceCalculator.tsx` | Load template, pass custom definitions to calculator and UI |
| 4 | `src/components/dashboard/InvoiceCalculator.tsx` | Apply custom Xero line item config from template |




## Add New Package: Hybrid Tiered with Asset Group Filtering

### Overview
Create a new package type called `hybrid_tiered_assetgroups` that combines the pricing model of `hybrid_tiered` (on-grid vs hybrid per-MWp rates) with the asset group filtering capabilities of the Elum packages. This allows contracts to specify different rates for on-grid and hybrid sites while also filtering which assets belong to this specific contract.

---

### Technical Details

#### Database Changes
No database changes required - the existing `contracts` table already has all necessary columns:
- `ammp_asset_group_id`, `ammp_asset_group_name` (Primary filter)
- `ammp_asset_group_id_and`, `ammp_asset_group_name_and` (AND filter)
- `ammp_asset_group_id_not`, `ammp_asset_group_name_not` (NOT/exclusion filter)
- `custom_pricing` (stores `ongrid_per_mwp` and `hybrid_per_mwp`)

---

### Files to Modify

#### 1. `src/data/pricingData.ts`
Add `hybrid_tiered_assetgroups` to the `PackageType` union type.

#### 2. `src/components/contracts/ContractForm.tsx`
- Add `hybrid_tiered_assetgroups` to the schema enum
- Add handler in `handlePackageChange` to set appropriate defaults (similar to `hybrid_tiered`)
- Extend the condition that shows Asset Group Filtering section to include `hybrid_tiered_assetgroups`
- Extend the condition that shows Hybrid Tiered Pricing section to include `hybrid_tiered_assetgroups`

#### 3. `src/lib/invoiceCalculations.ts`
- Add handling for `hybrid_tiered_assetgroups` in `calculateInvoice()` function
- Use the same logic as `hybrid_tiered` for the pricing calculation
- The asset filtering happens at sync time, so `cached_capabilities` will already contain only the filtered assets

#### 4. `src/pages/ContractDetails.tsx`
Add display name for the new package type in the package label mapping.

#### 5. `src/components/dashboard/InvoiceCalculator.tsx`
Add handling for `hybrid_tiered_assetgroups` alongside `hybrid_tiered` where applicable.

#### 6. `src/services/analytics/dashboardAnalytics.ts`
Add `hybrid_tiered_assetgroups` to the package type handling for ARR calculations.

#### 7. `src/lib/supportDocumentGenerator.ts`
Add handling for `hybrid_tiered_assetgroups` in support document generation.

#### 8. `src/components/customers/CustomerCard.tsx`
Add display handling for `hybrid_tiered_assetgroups` package type.

---

### Implementation Summary

| File | Change |
|------|--------|
| `src/data/pricingData.ts` | Add `hybrid_tiered_assetgroups` to `PackageType` |
| `src/components/contracts/ContractForm.tsx` | Add to schema, package handler, show asset group UI, show hybrid pricing UI |
| `src/lib/invoiceCalculations.ts` | Add case for `hybrid_tiered_assetgroups` calculation |
| `src/pages/ContractDetails.tsx` | Add package display name |
| `src/components/dashboard/InvoiceCalculator.tsx` | Handle module exclusion like `hybrid_tiered` |
| `src/services/analytics/dashboardAnalytics.ts` | Add to ARR calculation logic |
| `src/lib/supportDocumentGenerator.ts` | Add to support doc generation |
| `src/components/customers/CustomerCard.tsx` | Add display handling |

---

### Result

After implementation:
1. A new "Hybrid Tiered (Asset Groups)" package will appear in the package dropdown
2. Selecting it will show:
   - The on-grid and hybrid per-MWp pricing fields
   - The Asset Group Filtering section (Primary, AND, NOT filters)
3. Invoice calculations will use the filtered asset breakdown from `cached_capabilities`
4. AMMP sync will respect asset group filters (already supported by existing sync logic)


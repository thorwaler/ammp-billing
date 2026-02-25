

## Add Discount Defaults and Asset Group Scoping to Contract Types

### What's Changing

Two enhancements to the contract type template system:

1. **Default discount fields** -- Each contract type template can specify default `upfront_discount_percent` and `commitment_discount_percent` values. When a contract is created from this template, these defaults pre-fill the contract form.

2. **Asset group scoping flag** -- A toggle on any contract type that marks it as "asset group scoped." This means contracts using this template filter their assets to a specific AMMP asset group rather than using the full customer org. This replaces the need for a separate `hybrid_tiered_assetgroups` pricing model -- any base model can be asset-group-scoped.

### Database Changes

**Table: `contract_types`** -- Add 3 columns:

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `default_upfront_discount_percent` | numeric | NULL | Template default for upfront payment discount |
| `default_commitment_discount_percent` | numeric | NULL | Template default for commitment discount |
| `asset_group_scoped` | boolean | false | Whether contracts of this type are scoped to an asset group |

### UI Changes

**File: `src/components/contract-types/ContractTypeForm.tsx`**

Add to the "Defaults" section:
- Two numeric inputs for **Default Upfront Discount (%)** and **Default Commitment Discount (%)** in the existing 3-column grid (expanding it to accommodate)
- A switch/toggle: **"Scope to Asset Group"** with description "Contracts of this type will be filtered to a specific AMMP asset group instead of the full organization"

**File: `src/components/contract-types/ContractTypeForm.tsx` (data interface)**

Add three new fields to `ContractTypeFormData`:
- `default_upfront_discount_percent: number`
- `default_commitment_discount_percent: number`
- `asset_group_scoped: boolean`

**File: `src/pages/ContractTypes.tsx`**

- Show an "Asset Group" badge on contract type cards when `asset_group_scoped` is true
- Map the new fields in `toFormData` and the save mutation payload

### Files Changed

| File | Change |
|------|--------|
| Database (`contract_types` table) | Add `default_upfront_discount_percent`, `default_commitment_discount_percent`, `asset_group_scoped` columns |
| `src/components/contract-types/ContractTypeForm.tsx` | Add discount inputs and asset group toggle to form; update interface and defaults |
| `src/pages/ContractTypes.tsx` | Map new fields in `toFormData`, save payload, and display asset group badge |


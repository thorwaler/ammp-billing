

## Custom Contract Types (Templates) Feature

### Overview

Add a "Contract Types" settings page where users can create reusable contract templates by combining existing pricing structures (per-MW modules, per-site fees, tiered pricing, etc.) with custom names, descriptions, and Xero account mappings. Built-in packages remain unchanged alongside custom ones.

### Concept

Each custom contract type is a **template** that defines:
- A unique name and description (e.g., "Partner X Monitoring", "Reseller Tier 2")
- Which pricing model it uses (picked from existing patterns)
- Custom-named modules and add-ons with their prices
- Xero line item descriptions and account codes
- Default values for billing frequency, currency, minimum annual value, etc.

### Pricing Models Available for Templates

Based on the existing packages, users can pick from these pricing structures:

| Pricing Model | Description | Based On |
|---|---|---|
| Per-MW Modules | Select modules priced per MWp/year | Starter, Pro, Custom, AMMP OS 2026 |
| Hybrid Tiered | Different rates for on-grid vs hybrid sites | Hybrid Tiered |
| Capped / Flat Fee | Fixed annual/monthly fee with optional MW cap | Capped |
| Per-Site | Onboarding fee + annual subscription per site | Per-Site (UNHCR) |
| Site-Size Threshold | Different per-MWp rates above/below a kWp threshold | Elum ePM |
| Per-Site Flat | Flat annual fee per site in an asset group | Elum Jubaili |
| Graduated MW Tiers | Different per-MW rates for MW ranges | Elum Internal |
| Quantity-Based Tiers | Price tiers based on a count (e.g., municipalities, API calls) | SolarAfrica API |
| POC / Trial | No billing, expiry tracking only | POC |

### Database Schema

**New table: `contract_types`**

| Column | Type | Description |
|---|---|---|
| id | uuid (PK) | |
| user_id | uuid | Creator |
| name | text | Display name (e.g., "Reseller Tier 2") |
| slug | text (unique) | URL-safe identifier, used as package value |
| description | text | Shown in package selector dropdown |
| pricing_model | text | One of: per_mw_modules, hybrid_tiered, capped, per_site, site_size_threshold, per_site_flat, graduated_mw_tiers, quantity_tiers, poc |
| default_currency | text | EUR or USD |
| default_billing_frequency | text | monthly, quarterly, biannual, annual |
| force_billing_frequency | boolean | If true, frequency cannot be changed (like per_site forces monthly) |
| default_minimum_annual_value | numeric | |
| modules_config | jsonb | Array of custom module definitions: [{id, name, price, available}] |
| addons_config | jsonb | Array of custom add-on definitions with same structure as AddonDefinition |
| xero_line_items_config | jsonb | Mapping of cost components to Xero descriptions and account codes |
| default_values | jsonb | Other default field values (base monthly price, retainer, thresholds, etc.) |
| is_active | boolean | Soft delete / archive |
| created_at | timestamptz | |
| updated_at | timestamptz | |

The `contracts` table needs a small change:
- Remove the CHECK constraint on `package` (or change it to allow any text value)
- Add `contract_type_id` (nullable uuid, FK to contract_types) for custom types

### How It Works End-to-End

1. **Creating a template**: User goes to Settings > Contract Types, clicks "New Type", picks a pricing model, then configures custom modules/add-ons with names and prices, sets defaults, and optionally defines Xero line item mappings.

2. **Using a template**: In the Contract Form package dropdown, custom types appear below a separator after the built-in packages. Selecting one pre-populates all fields from the template. The `package` column stores the template slug, and `contract_type_id` stores the reference.

3. **Calculating invoices**: The calculation engine checks if `contract_type_id` is set. If so, it loads the template config and uses the appropriate pricing model function (all existing calculation functions are reused). Custom module/add-on definitions from the template replace the hardcoded `MODULES`/`ADDONS` arrays.

4. **Xero sync**: Custom Xero line item config from the template overrides the default descriptions and account codes.

### UI Design

**Contract Types Settings Page** (`/settings/contract-types`)

The page has a list view showing all custom types with name, pricing model, and status. Each type can be edited or archived.

**Create/Edit Template Form** (dialog or full page)

Sections:
1. **Basic Info**: Name, description, slug (auto-generated from name)
2. **Pricing Model**: Dropdown to select one of the 9 models listed above
3. **Modules** (shown for per_mw_modules, hybrid_tiered models): Add custom modules with name and price per MWp. Users can add/remove rows.
4. **Add-ons**: Add custom add-ons with name, pricing type (fixed, complexity-based, or tiered), and prices
5. **Defaults**: Currency, billing frequency, minimum annual value, base monthly price, etc.
6. **Xero Mapping** (collapsible section): For each cost component (modules, add-ons, base price, setup fees), specify Xero description and account code (1000 for NRR, 1002 for ARR)

### Files to Create/Modify

| File | Change |
|---|---|
| **Database migration** | Create `contract_types` table; drop package CHECK constraint; add `contract_type_id` to `contracts` |
| `src/pages/ContractTypes.tsx` | New page: list, create, edit, archive contract types |
| `src/components/contract-types/ContractTypeForm.tsx` | New: form for creating/editing a contract type template |
| `src/components/contract-types/ModuleEditor.tsx` | New: dynamic module list editor (add/remove rows with name + price) |
| `src/components/contract-types/AddonEditor.tsx` | New: dynamic add-on list editor |
| `src/components/contract-types/XeroMappingEditor.tsx` | New: Xero line item configuration |
| `src/components/contract-types/PricingModelSelector.tsx` | New: visual selector for the 9 pricing models |
| `src/routes.tsx` | Add route for `/settings/contract-types` |
| `src/components/layout/Sidebar.tsx` | Add navigation link under Settings |
| `src/components/contracts/ContractForm.tsx` | Load custom types into package dropdown; when selected, apply template defaults and use custom modules/addons |
| `src/lib/invoiceCalculations.ts` | Accept custom module/addon definitions from template instead of hardcoded arrays |
| `src/components/dashboard/InvoiceCalculator.tsx` | Load template config for custom contract types; pass custom modules/addons to calculation and Xero sync |
| `src/data/pricingData.ts` | Export pricing model type; no structural changes to existing data |

### Implementation Phases

**Phase 1: Database + Template CRUD**
- Create `contract_types` table with RLS policies
- Build the Contract Types settings page with list view
- Build the template creation form with pricing model selector and module/addon editors

**Phase 2: Contract Form Integration**
- Load custom types into the package dropdown
- Apply template defaults when a custom type is selected
- Save `contract_type_id` on the contract record
- Remove the package CHECK constraint to allow custom slugs

**Phase 3: Invoice Calculation Integration**
- Modify calculation engine to accept custom module/addon configs from templates
- Load template config in InvoiceCalculator when processing custom-type contracts

**Phase 4: Xero Integration**
- Apply custom Xero line item descriptions and account codes from template config
- Fall back to sensible defaults when not configured


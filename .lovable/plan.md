# New package: Enterprise eConf (asset-group based)

A new contract package that prices like Elum Portfolio OS — per MWp per year, annual minimum, optional one-time onboarding fee — but where membership of the **eConf asset group** raises the rate for those sites, exactly like the C&I Lite base + eConf split. Resolution is purely asset-group driven: no sub-org IDs, no feature flags.

Reference: ANNEX C (NEA) — €650 per MWp/year, +€150 per MWp/year eConf add-on, €5,000 minimum ARR, €1,075 onboarding fee.

## How it prices

For each site in the primary asset group:

- Site is **not** in the eConf group -> `MWp x base rate` (default €650/MWp/yr)
- Site **is** in the eConf group -> `MWp x (base rate + eConf rate)` (default €650 + €150 = €800/MWp/yr)
- Sites in the exclusion (NOT) group, when one is configured, are dropped
- The sum is compared against the **minimum annual value**; the higher wins (floor, not addition)
- The **onboarding fee** is a one-time line on the first invoice, as with other packages
- Billing frequency scales the annual amount as usual (quarterly = 25%)

All four numbers (base rate, eConf rate, minimum ARR, onboarding fee) are editable per contract, so the same package can serve future enterprise annexes with different pricing.

## Where it shows up

- **Contract form** — new package option "Enterprise eConf (asset groups)"; asset group selectors (primary / AND-eConf / NOT) plus base rate, eConf rate, minimum annual value, onboarding fee.
- **Contract details** — sync resolves the primary group, splits members into standard and eConf buckets, and the Org resolution panel shows the two segments with their asset and MWp counts.
- **Invoice calculator** — a breakdown with a Standard segment and an eConf segment (assets, MWp, rate, cost), then the minimum-fee comparison.
- **Support document** — per-site table with a Rate column showing €650 or €800 so the eConf uplift is visible per site, plus segment subtotals.
- **Xero** — one line per segment ("Technical Monitoring — Standard", "Technical Monitoring — eConf"), plus the onboarding fee line when applicable, following the existing site-aware line item rules.

## Technical details

- `src/data/pricingData.ts`: add `enterprise_econf` to `PackageType`, with defaults (base 650, eConf 150, minimum 5000, onboarding 1075) and a label.
- Database: reuse existing contract columns — `ammp_asset_group_id`, `ammp_asset_group_id_and`, `ammp_asset_group_id_not`, `minimum_annual_value`, `onboarding_fee`. Add two numeric columns for the base and eConf per-MWp rates (or reuse `elum_lite_base_rate` / `elum_lite_econf_rate` if they are free-form; a migration adds dedicated ones only if needed).
- `supabase/functions/ammp-sync-contract/index.ts`: treat the new package on the pure asset-group path (the existing `ammp_asset_group_id` + AND/NOT branch around lines 848-880). Reuse the base/eConf split that already builds `legacy:<group>:base` and `legacy:<group>:econf` segments, so cached capabilities carry both buckets. No sub-org discovery, no feature-flag classification, no coverage/leakage checks.
- `src/lib/invoiceCalculations.ts`: new branch computing the two-segment MWp cost and applying the minimum as a floor; result exposed as a dedicated breakdown object so UI and PDF can render segments.
- `src/lib/supportDocumentGenerator.ts`: per-site rows with the effective rate and segment subtotals; suppress the module-based "Monitoring Fee Price Breakdown" block for this package (same treatment as the Elum org-tier packages).
- `src/components/dashboard/InvoiceCalculator.tsx` and `src/components/invoices/MergedInvoiceDialog.tsx`: segment-level Xero line items.
- `src/components/contracts/ContractForm.tsx`: package option, default seeding on selection, and the rate/minimum/onboarding fields; `src/lib/contractFormMapping.ts` maps them back on edit.
- `src/services/analytics/dashboardAnalytics.ts`: contract ARR uses the same two-segment calculation so customer tabs show the right value.

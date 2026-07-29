## Goal

Move Elum invoicing from asset-group-based to organisation-based, per the signed 2026 contract. One contract per **discovery tier** (C&I Lite, C&I Pro, Utility); each discovers its sub-orgs under the Elum parent org via `feature_flags`, prices each sub-org's full asset portfolio, and emits one invoice line per sub-org. Internal and Enterprise (Jubaili, NEA) keep their existing single-org contracts and pricing logic unchanged — they are simply pulled into the same Elum invoice-creation flow and the combined annual minimum.

## 1. Org discovery (AMMP API)

- Extend the AMMP data proxy allow-list and `dataApiClient` with `listOrgs(parentOrgId?)` → `GET /v1/orgs?parent_org_id=…` returning `org_id, uid, org_name, parent_org_id, feature_flags`.
- New `src/services/ammp/orgService.ts` classifies each sub-org by flag:
  - `epm_lite` → C&I Lite, `epm_pro` → C&I Pro, `epm_utility` → Utility
  - `remote_econf: true` → org-wide eConf add-on (billable only on Lite; bundled in Pro/Utility)
  - orgs with no tier flag → listed as "unassigned", excluded from pricing, surfaced as a warning
  - the Internal and Enterprise org IDs are excluded from discovery (they are handled by their own contracts).
- `ammp-sync-contract` gains an org-scoped mode for tier contracts: resolve sub-orgs → for each, take all assets with that `org_id` → enrich as today → store in `cached_capabilities` grouped per org (`{ orgs: [{ orgId, orgName, uid, flags, assets: [] }], assets: [...flat] }`). Flat list kept for backward compatibility. Internal/Enterprise contracts continue to sync exactly as today.

## 2. New tier packages and pricing

Three new package types; existing `elum_internal`, `elum_jubaili` and the NEA/Enterprise setup stay untouched.

| Tier | Package | Pricing |
|---|---|---|
| C&I Lite | `elum_ci_lite` | €65/MWp/yr on org portfolio + €335/MWp/yr when `remote_econf` is set — add-on charged on **all** sites in that org |
| C&I Pro | `elum_ci_pro` | Per site by size: ≤1 MWp €650, >1 & <2 MWp €450, ≥2 MWp €300 (site-by-site, never aggregated) |
| Utility | `elum_utility` | Single blended rate by org portfolio size: <10 €300, 10–20 €285, 20–30 €270, 30–40 €255, 40–50 €240, 50–60 €225 — applied uniformly to all MWp |

Rates are editable defaults on the contract, quarterly billing, annual amounts pro-rated to the actual billing period.

**Utility guard:** block calculation if any site in a utility org has PV capacity ≤ 2 MWp, listing the offending sites. Battery-only sites get a per-asset "MWh entered in PV capacity field" override that suppresses the guard and is annotated in the support document.

## 3. Hybrid transition + de-duplication

- A tier contract may additionally carry legacy asset-group filters. Resolution order: org-discovered assets first, then asset-group assets not already covered.
- Assets appearing in both are counted **once** (org side wins) and recorded as `doubleCountWarnings`.
- Support document gains a "Transition / double-counting check" section: assets from orgs, assets still only in asset groups, and overlaps found.

## 4. Invoice + support document output

- **Xero:** one line per sub-org — `"{Tier} — {Org name} — {MWp} MWp"`; a separate line for the C&I Lite eConf add-on per org; legacy asset-group remainder as its own line. Internal/Enterprise contracts keep their current line items.
- **Support document:** per-sub-org sections with org name, uid, total MWp, applied rate/bracket, price, and the full asset list (name, PV capacity, size bucket where relevant), followed by the transition/double-count section and a contract totals summary.

## 5. Combined €80k annual minimum on the Elum org

- The reconciliation is **customer-level, across all Elum contracts** (Lite, Pro, Utility, Internal, Enterprise), not per contract.
- Anniversary anchor lives on the Elum customer/parent org (first ongoing-monitoring invoice date + 365 days), first evaluation landing with the **Q3 invoice**.
- Logic: sum ongoing monitoring revenue for the year **after** per-customer/Enterprise minimums have been applied; if under €80,000, add the shortfall as a reconciliation line on the following invoice.
- Surfaced in the support document as a year-to-date tracker so the gap is visible before the anniversary.

## 6. Existing foundations — verify they apply to every Elum contract

Zero-PV estimate (max PV output × 1.2), 30-day fix window, mid-quarter (15th) freeze + snapshot/30-day revision, inflation cap on the ECB 6-month average, and the ~200-day anniversary notice already exist. This step is a verification pass: confirm each one triggers for the new org-based tier contracts **and** for the Internal/Enterprise Elum contracts, and that per-org results show correctly in the support document.

## Technical notes

- Files: `supabase/functions/ammp-data-proxy`, `supabase/functions/ammp-sync-contract`, `src/services/ammp/dataApiClient.ts`, new `src/services/ammp/orgService.ts`, `src/types/ammp-api.ts`, `src/data/pricingData.ts`, `src/lib/invoiceCalculations.ts`, `src/lib/supportDocumentGenerator.ts`, `src/components/invoices/SupportDocument.tsx` + `PdfRenderer.tsx`, `src/components/dashboard/InvoiceCalculator.tsx`, `src/components/contracts/ContractForm.tsx`.
- Migration: add `elum_tier`, `elum_parent_org_id`, `org_pricing_config` (jsonb) to `contracts`; customer-level minimum tracking fields for the combined €80k reconciliation. Per-org resolution is cached in `cached_capabilities` — no new tables.

## Out of scope

- Changes to Internal / Jubaili / NEA pricing logic (NEA still uses an asset group for the eConf split).
- Ecosys offboarding, ISO-certification tracking, Elum-side asset-group cleanup.

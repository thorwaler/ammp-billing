## Fix Elum contract value showing €0 on customer cards

Verified: `src/pages/Customers.tsx` sums `calculateSingleContractARR(contract)` over active contracts, and that helper (`src/services/analytics/dashboardAnalytics.ts:232`) calls `calculateInvoice` without the Elum 2026 org-tier inputs — no `orgBreakdown`, no `elumLiteBaseRate` / `elumLiteEconfRate` from `org_pricing_config`. The pricing engine returns 0 for `elum_ci_lite` / `elum_ci_pro` / `elum_utility` without those, so the Elum card reads "€0/year" even though the cached capabilities hold the org breakdown.

### Changes (`src/services/analytics/dashboardAnalytics.ts`)
- Extend the `contract` input type of `calculateSingleContractARR` with `org_pricing_config`.
- Read `orgBreakdown` from `cached_capabilities`.
- Pass `orgBreakdown`, `elumLiteBaseRate` and `elumLiteEconfRate` (from `org_pricing_config`) into the `calculateInvoice` call — mirroring the fix already applied in `UpcomingInvoicesList.tsx`.
- Relax the guard on line 301 so org-tier Elum contracts with `totalMW === 0` but a non-empty `orgBreakdown` are still calculated.

No query changes needed — `Customers.tsx` already selects `contracts (*)`.

### Side effect
Dashboard ARR and reports use the same helper, so Elum org-tier contracts will start contributing their real annual value there too.

Out of scope for this pass: the Elum Utility sync returning no assets (no sub-org carries the `epm_utility` flag).

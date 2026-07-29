## 1. Merge the eConf line into the org line

Today each C&I Lite org with the eConf add-on produces two Xero lines (base + "Remote eConf"), which is why the €165.21 line looked like an extra pass — it's the eConf add-on for the "Legacy asset group — with eConf" pseudo-org (6 sites, 1.973 MWp @ €335/MWp/yr), already shown in the support doc as a column on that same row.

Change: emit **one line per org**, with the combined amount.

- `src/components/dashboard/InvoiceCalculator.tsx` (lines 1129-1153): replace the two-line emit with a single line using `org.totalCost` (= `baseCost + econfCost`). Description carries both rates when eConf applies, e.g.
  `C&I Lite — Green Yellow France (8 sites, 0.60 MWp) @ €65/MWp/yr + Remote eConf @ €335/MWp/yr`
  and stays as-is (base rate only) when `econfCost === 0`. Guard on `org.totalCost > 0`.
- `src/components/invoices/MergedInvoiceDialog.tsx` (around line 385): apply the same merge, keeping the `[contractLabel]` prefix.
- Account code stays `ACCOUNT_PLATFORM_FEES` for both components, so ARR/NRR classification is unchanged.

Support doc keeps the Base / eConf / Total columns so the split is still auditable; a footnote will note that eConf is invoiced within the org's single line.

## 2. Scope "No assets resolved for this organisation." to the org row

In `src/lib/invoiceCalculations.ts`, `calculateElumOrgTierBreakdown` returns `warnings: [...globalWarnings, ...orgLines.flatMap(o => o.warnings)]`, so every per-org notice is duplicated as a contract-wide banner (`SupportDocument.tsx:145`, `PdfRenderer.tsx:149`) — hence the "No assets resolved" text under the C&I Lite heading despite 140 resolved sites. Per-org rendering already exists at `SupportDocument.tsx:208`.

Fix: return only `globalWarnings` plus any warning that set `blocked` (the Utility "<2 MWp sites" warning), leaving informational per-org notices on `org.warnings`. `blocked` itself is unchanged, so the Xero submission gate in `InvoiceCalculator.tsx` still works.

## 3. Hide the all-zero "Monitoring Fee Price Breakdown"

`generateAssetBreakdown()` in `src/lib/supportDocumentGenerator.ts` has no branch for Elum 2026 org-tier packages, so it falls to the default path where `baseRatePerMWp` stays `0` and every row prints €0.00. Add an early return `{ assetBreakdown: [] }` for `isElumOrgTierPackage(packageType) && calculationResult.elumOrgTierBreakdown` (same treatment as `elum_internal` / `per_site`). Both renderers already skip the section when empty, and the period total comes from `elumOrgTierBreakdown.totalCost`, so no amounts change.

## Files touched

- `src/lib/invoiceCalculations.ts` — warning scoping
- `src/lib/supportDocumentGenerator.ts` — suppress the zero asset table for org tiers
- `src/components/dashboard/InvoiceCalculator.tsx` — single combined Xero line per org
- `src/components/invoices/MergedInvoiceDialog.tsx` — same merge for merged invoices
- `src/components/invoices/SupportDocument.tsx` — eConf footnote

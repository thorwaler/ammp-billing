# Summarize Elum invoice lines into one recurring line

Elum invoices currently push a separate Xero line for every sub-organisation, MW tier, site bucket, module and minimum charge. Going forward, all recurring platform charges on an Elum contract collapse into a single line; the full breakdown lives in the support document that is already attached to the invoice.

## What changes

For every Elum package (Portfolio OS, ePM, Jubaili, Internal, and the 2026 org tiers: C&I Light, C&I Pro, Utility, Internal 2026), the Xero invoice will show:

- One recurring line, e.g. `Elum C&I Light — Platform Monitoring (140 sites, 62.40 MWp)` with the full recurring amount, on the Platform Fees account.
- One-time fees (onboarding setup, vendor API) stay as their own separate lines on the Implementation account.
- Any non-recurring credits/adjustments already emitted (discount lines, prepaid credits) also stay separate so the invoice still reconciles.

Nothing about the calculated amounts changes — only how they are grouped on the invoice. The support document keeps the full per-organisation, per-tier and per-site detail.

The Enterprise eConf (NEA) package is asset-group based and not an Elum contract, so it keeps its current line items unless you want it included too.

## Where it applies

- The single-contract invoice creator.
- The merged multi-contract invoice dialog, where the summary line keeps its `[Contract name]` prefix so each contract stays identifiable.

## Technical notes

- Add an `isElumPackage(packageType)` helper in `src/data/pricingData.ts` covering `elum_portfolio_os`, `elum_epm`, `elum_jubaili`, `elum_internal` and the four `isElumOrgTierPackage` values.
- In `src/components/dashboard/InvoiceCalculator.tsx` and `src/components/invoices/MergedInvoiceDialog.tsx`, gate the existing recurring pushes (base pricing, `moduleCosts`, `minimumCharges`, `siteMinimumPricingBreakdown`, `elumOrgTierBreakdown`, `elumInternalBreakdown`, `elumEpmBreakdown`, `elumJubailiBreakdown`) behind `!isElumPackage(...)`.
- Replace them with one push whose `UnitAmount` is the sum of those same recurring components, and whose description is derived from the package label plus aggregate site count and MWp (from `elumOrgTierBreakdown` totals when present, otherwise from the synced asset totals).
- Keep one-time fee, discount and credit pushes outside the gate, and keep the existing ARR/NRR classification totals unchanged.

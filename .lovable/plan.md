## 1. Invoice cards show €0 for Elum 2026 contracts

Verified: `calculateEstimatedAmount` in `src/components/invoices/UpcomingInvoicesList.tsx` calls `calculateInvoice` without `orgBreakdown`, `elumLiteBaseRate` or `elumLiteEconfRate`. Elum org-tier pricing (`invoiceCalculations.ts` line 1278) prices strictly from `params.orgBreakdown`, so an empty list yields €0 — this is why both C&I Pro and C&I Lite cards read €0 even though C&I Lite has 39 org rows cached.

Fix in `UpcomingInvoicesList.tsx`:
- Add `org_pricing_config` to the contracts select and carry it on the `UpcomingInvoice` type.
- In `calculateEstimatedAmount`, pass `orgBreakdown: invoice.cachedCapabilities?.orgBreakdown || []`, plus `elumLiteBaseRate` / `elumLiteEconfRate` from `org_pricing_config`, mirroring how `InvoiceCalculator.tsx` (lines 890–894) builds its params.

Result: card values, the customer-group subtotal and the "Create Merged Invoice (€…)" button all show real estimates.

## 2. Weird symbols in the support-doc Band column

The Pro bands are defined with Unicode math signs in `src/data/pricingData.ts` (`"≤ 1 MWp"`, `"≥ 2 MWp"`). The PDF font can't encode them, so they render as the garbled `"e 2 M W p"` seen in the screenshot.

Fix: replace the non-ASCII characters in the Elum band/tier labels with plain text:
- `≤ 1 MWp` → `Up to 1 MWp`
- `≥ 2 MWp` → `2 MWp and above`
- en-dashes in the graduated MW tier labels (`10–20 MWp` etc.) → hyphens.

Also apply the same ASCII-safe treatment to the utility tier labels if they contain the same characters.

## 3. Organisation totals in the per-org tables

In `src/components/invoices/SupportDocument.tsx` (per-org site tables, around line 213):
- Add the org total cost to the heading: `Org name — 2 sites, 3.699 MWp, €324.13`.
- Add a bold total footer row to each per-org table summing MWp and Cost.

The mirrored PDF/HTML export path in `src/lib/supportDocumentExport.ts` gets the same heading + total row so the downloaded document matches.

## Not touched

Parent-org ID / sync configuration — left as is per your note.

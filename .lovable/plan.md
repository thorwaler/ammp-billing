# Elum support document fixes

Five corrections to the invoice support document (screen + PDF) for Elum-family contracts.

## 1. Organisation breakdown shows the real rate (C&I Lite, NEA / Enterprise eConf)

Today the "Rate" column prints only the base rate (e.g. €65/MWp/yr, €650/MWp/yr), even when the organisation carries the remote eConf upgrade — so both the standard and eConf rows look identical, and the rate doesn't reconcile with the row total.

Change: when eConf applies to an organisation, the Rate cell shows the combined effective rate with its composition, e.g. `€400.00/MWp/yr (€65 base + €335 eConf)`. Rows without eConf are unchanged. Same change in the PDF renderer.

## 2. Year-to-date summary is empty

The YTD table only lists invoices already saved for that contract in the calendar year, so it renders empty (and €0.00) while previewing a brand new invoice — and for contracts whose earlier invoices sit on a different contract record.

Change:
- Include the invoice currently being generated as a provisional row (marked "current"), so the year total is never €0 for a real invoice.
- When there are no other invoices in the year, show an explanatory line ("No earlier invoices for this contract in <year>") instead of a bare empty table.

## 3. Jubaili: kVA-based presentation and minimum reconciliation

- Per-site table switches from kWp to genset kVA: columns become `Genset (kVA)`, `€/kVA/yr`, `Annual fee`. Sites with no rating in AMMP are shown as "not set" and excluded from the rate column, as today.
- Remove the misleading fixed "per site annual fee" figure from the summary block, since the fee now depends on the genset band.
- Add a closing reconciliation block: banded annual total vs. the contracted annual minimum, the higher of the two picked, then divided by the billing frequency — so the €5k quarterly charge is traceable.

## 4. Invoice period shows the full range

The header prints a single month (e.g. "Sep 2026"). It will print the billing period range instead, e.g. `1 Jul 2026 – 30 Sep 2026`, falling back to the current single-month label when no period dates are available. Applies to every Elum support doc (and any package that carries period dates).

## Technical notes

- `src/components/invoices/SupportDocument.tsx` — rate cell composition, Jubaili tables, YTD empty state, period header.
- `src/components/invoices/PdfRenderer.tsx` — mirror the same four changes in the PDF output.
- `src/lib/supportDocumentGenerator.ts` — build `invoicePeriod` from `periodStart`/`periodEnd`; append the current in-progress invoice to `yearInvoices`; pass genset kVA and per-kVA rate through the Jubaili breakdown; expose `minimumAnnualFee` vs `bandedCost` for the reconciliation block.
- `src/lib/invoiceCalculations.ts` — expose a combined `effectiveRate` on each org line in `elumOrgTierBreakdown` (no pricing change; the totals already include eConf) and carry `gensetKVA` on Jubaili site lines if not already present.

No database or pricing changes; invoice amounts stay identical.

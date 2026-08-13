# Elum: excluded-org leak fix + support document corrections

Two workstreams: finish the excluded-organisation cleanup in the AMMP sync, and fix the Elum support documents.

## Part A — Excluded orgs still leaking in via legacy asset groups

The Elum virtual-assets organisation is excluded from flag-based discovery, but 6 of its assets still reach the Internal contract because they are members of the legacy `[Tier] Internal` asset group, which is processed on a separate path that never applies the exclusion filter.

1. Apply the excluded-org filter to every asset entry path in the sync — including assets pulled from legacy asset groups and from the coverage checks — not just flag-based discovery.
2. Record what was dropped (org name, asset count, source path) in the contract's cached capabilities, so the exclusion is auditable rather than silent.
3. Org resolution panel on the contract page: show, per sub-organisation, whether it was resolved by feature flag or by legacy asset group, and list excluded organisations with the number of assets removed.

## Part B — Support document fixes

### 1. Organisation breakdown shows the real rate (C&I Lite, NEA / Enterprise eConf)

The "Rate" column prints only the base rate (€65/MWp/yr, €650/MWp/yr) even when the organisation carries the eConf upgrade, so standard and eConf rows look identical and the rate doesn't reconcile with the row total.

Change: when eConf applies, the Rate cell shows the combined effective rate with its composition, e.g. `€400.00/MWp/yr (€65 base + €335 eConf)`. Rows without eConf are unchanged. Mirrored in the PDF.

### 2. Year-to-date summary is empty

The YTD table only lists invoices already saved for the contract in the calendar year, so it renders empty (€0.00) while previewing a new invoice.

Change: include the invoice being generated as a provisional "current" row so the year total is never €0, and show an explanatory line when there are no earlier invoices for that contract in the year.

### 3. Jubaili: kVA-based presentation and minimum reconciliation

- Per-site table switches from kWp to genset kVA: columns become `Genset (kVA)`, `€/kVA/yr`, `Annual fee`. Sites with no rating in AMMP stay flagged as "not set".
- Remove the fixed per-site annual fee figure from the summary block — the fee now depends on the genset band.
- Add a closing reconciliation block: banded annual total vs. the contracted annual minimum, the higher of the two picked, divided by the billing frequency, so the €5k quarterly charge is traceable.

### 4. Invoice period shows the full range

The header prints a single month (e.g. "Sep 2026"). It will print the billing period range instead, e.g. `1 Jul 2026 – 30 Sep 2026`, falling back to the month label when no period dates exist. Applies to all Elum support docs.

## Technical notes

- `supabase/functions/ammp-sync-contract/index.ts` — filter group-sourced assets by `org_id` against the excluded set; log drops into `cached_capabilities.excludedOrgs` with source path; redeploy.
- `src/pages/ContractDetails.tsx` — resolution source badge (flag vs legacy group) and excluded-org detail in the Org resolution panel.
- `src/components/invoices/SupportDocument.tsx` — rate cell composition, Jubaili tables, YTD empty state, period header.
- `src/components/invoices/PdfRenderer.tsx` — mirror the same four changes.
- `src/lib/supportDocumentGenerator.ts` — build `invoicePeriod` from `periodStart`/`periodEnd`; append the current in-progress invoice to `yearInvoices`; pass genset kVA and per-kVA rate through the Jubaili breakdown; expose minimum vs banded totals.
- `src/lib/invoiceCalculations.ts` — expose a combined effective rate on each org line in `elumOrgTierBreakdown` (no pricing change) and carry `gensetKVA` on Jubaili site lines.

No database schema or pricing changes; invoice amounts stay identical apart from the excluded assets already intended to be dropped.

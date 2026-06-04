# Per-MW with Annual Upfront Minimum

## What we're building

A new built-in package type, `per_mw_annual_upfront`, that combines two billing cadences on a single contract:

1. **Annual upfront invoice** — at the start of each contract year, charge `max(fixed_annual_minimum, committed_minimum_mw × per_mw_rate)`. This is non-refundable and acts as a prepaid floor.
2. **Quarterly cap-check invoices** — each quarter we compute the year-to-date per-MW value (sum of selected modules × current MW). If cumulative YTD > annual minimum already paid, we invoice the difference between this quarter's new cumulative total and what's been invoiced so far. Otherwise the quarter is $0 / skipped.

Module pricing reuses the existing per-MW module editor (same UX as the Pro package).

## How a year plays out (example)

```
Annual minimum: €60,000   |   Per-MW rate (modules): €40,000/MWp/yr
Year start (Jan 1):  Invoice €60,000 upfront  (annual cycle)
Q1 end (Apr 1):  MW=1.2 → YTD value €48,000 → ≤ €60k → no invoice
Q2 end (Jul 1):  MW=1.5 → YTD value €60,000 → ≤ €60k → no invoice
Q3 end (Oct 1):  MW=1.8 → YTD value €72,000 → €12,000 over → invoice €12,000
Q4 end (Jan 1):  MW=2.0 → YTD value €80,000 → invoice delta €8,000 + new annual €60,000
```

## Contract fields (additions)

On `contracts`:
- `annual_minimum_fee` (numeric) — fixed floor amount.
- `committed_minimum_mw` (numeric, nullable) — optional; if set, floor = max(annual_minimum_fee, committed_mw × rate).
- `annual_billing_anchor_date` (timestamptz) — locks the upfront cycle start (defaults to contract start).
- `last_annual_invoice_date` (timestamptz) — tracks when last annual upfront was billed.
- `ytd_invoiced_amount` (numeric, default 0) — running total of what's been invoiced this contract year (annual + quarterly extras). Reset on each new annual cycle.

`billing_frequency` is no longer a single dropdown for this package — it's implicitly **dual cadence** (annual + quarterly).

## Invoice generation flow

A single "next invoice" event for these contracts becomes the earlier of:
- next quarterly checkpoint (anchor + 3/6/9 months)
- next annual anchor date

The Upcoming Invoices list and `UpcomingInvoicesList.tsx` show both cadences as separate rows (labeled "Annual upfront" vs "Quarterly overage"). Creating one updates `ytd_invoiced_amount`; the annual rollover resets it and bills the new annual minimum.

## Files to touch

**Schema (migration)**
- Add the 5 new columns to `contracts` listed above (all nullable / defaulted, no breaking change).

**Pricing config**
- `src/components/contract-types/PricingModelSelector.tsx` — add `per_mw_annual_upfront` option.
- `src/components/contract-types/ContractTypeForm.tsx` — include it in `showModulesFor` so modules editor renders, and surface inputs for annual minimum + committed MW.

**Contract form**
- `src/components/contracts/ContractForm.tsx` — when package = `per_mw_annual_upfront`: render modules editor, annual-minimum input, committed-MW input, annual anchor date; hide billing frequency dropdown (or lock to "Dual: annual + quarterly").

**Invoice calculation**
- `src/lib/invoiceCalculations.ts` — new `else if (packageType === 'per_mw_annual_upfront')` branch. Adds two helpers:
  - `calculateAnnualUpfrontFloor(contract, totalMW)` → returns floor amount.
  - `calculateQuarterlyOverage(contract, totalMW, ytdInvoiced)` → returns delta to invoice this quarter (0 if under floor).
  - Returns one of two `CalculationResult` shapes tagged with `cycleType: 'annual_upfront' | 'quarterly_overage'`.

**Scheduling / next-invoice-date**
- Wherever `next_invoice_date` is computed for a contract (search for `next_invoice_date` writers), add a branch that, for this package, returns `min(nextAnnualDate, nextQuarterlyDate)`. Likely in invoice creation + `UpcomingInvoicesList.tsx`.

**UI surfaces**
- `UpcomingInvoicesList.tsx` & `CustomerInvoiceGroup.tsx` — label upcoming rows as "Annual upfront" vs "Quarterly overage (YTD over min)" with the computed amount.
- `InvoiceCalculatorDialog.tsx` — show both cycle previews.

**Memory**
- New `mem://features/package-per-mw-annual-upfront.md` describing the dual-cadence rule and YTD-reset logic.
- Append entry to `mem://index.md` under Pricing & Packages.

## Technical details (for engineers)

- "Contract year" = period between `annual_billing_anchor_date` and that date + 12 months. `ytd_invoiced_amount` resets to the annual floor amount on each rollover (then quarterly overages accumulate on top).
- Quarterly overage formula:
  `delta = max(0, current_ytd_module_value − max(ytd_invoiced_amount, annual_floor))`
  Invoice only if `delta > 0`.
- Annual rollover and quarterly invoices both write to `ytd_invoiced_amount` atomically with the invoice insert (same transaction / mutation).
- Xero line-items: annual invoice → single "Annual platform fee" line; quarterly → "Per-MW overage Q{n}" line with MW + rate context.
- ARR classification: annual upfront amount counts as ARR (account 1002). Quarterly overage also ARR.
- Currency: respect `contract.currency` per project rule; never hardcode €.
- Dates: all anchor / quarterly boundaries computed in CET via existing `parseDateCET` / `dateUtils`.

## Out of scope

- No changes to existing packages.
- No retroactive migration of existing contracts to the new model.
- No refund logic if MW drops below minimum mid-year (annual fee is non-refundable per the model).

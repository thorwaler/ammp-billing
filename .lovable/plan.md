## Goal
Make the SPS quarterly invoice actually deduct the €100k annual upfront, both for this April–June 2026 invoice (backfill) and automatically going forward each year on the anchor date.

## Why the current invoice shows €20,886 instead of €0
- The new dual-cadence SPS logic is wired up, but it only applies a credit if `contracts.ytd_invoiced_amount` (repurposed as "remaining prepaid balance") is > 0.
- The Feb 28 2026 €100k annual-upfront invoice was never generated through the app, so the prepaid balance is still 0 — nothing to credit against.
- The "-€100,000 Upfront Annual Payment (prepaid)" line in the waterfall is hard-coded display text from the legacy SPS branch; it's not tied to real bookkeeping.

## Changes

### 1. Backfill SPS's prepaid balance (one-time)
Set on the SPS Investments Seychelles Ltd contract:
- `ytd_invoiced_amount = 100000` (remaining prepaid balance for FY2026)
- `last_annual_invoice_date = 2026-02-28` (so we don't re-bill the upfront this cycle)

### 2. Auto-generate the annual upfront invoice on anchor date
Update the upcoming-invoices scheduler so that for SPS contracts with `annual_billing_anchor_date` set:
- Each year on/after the anchor date, surface an extra "Annual Upfront" invoice row (separate from the regular quarterly cadence) when `last_annual_invoice_date` is missing or older than 1 year.
- When that invoice is sent through Xero, set `ytd_invoiced_amount = annualUpfrontAmount` and `last_annual_invoice_date = anchor date` (this bookkeeping already exists in `InvoiceCalculator`'s post-Xero update; we just need the row to appear).

Files touched:
- `src/components/invoices/UpcomingInvoicesList.tsx` — inject a synthetic upcoming row for SPS annual-upfront when due.
- `src/lib/invoiceScheduling.ts` — helper `getNextSPSAnnualUpfrontDate(contract)` reused by the list and by `InvoiceCalculator`.
- `src/components/dashboard/InvoiceCalculator.tsx` — when invoked from that synthetic row, force `spsIsAnnualCycle = true` regardless of `periodStart` month, so the calc bills €100k and the regular quarterly cadence is untouched.

### 3. Live prepaid-balance waterfall
Replace the static "Upfront Annual Payment (prepaid): -€100,000 / Excess Annual Amount: €0 / quarterly monitoring charge is €0" block with values derived from `spsAnnualUpfrontBreakdown`:

```text
Annual Discounted Fee:                 €83,543.89
Annual Upfront Amount (max w/ €100k):  €100,000.00
─────────────────────────────────────────────────
Prepaid Balance Before this invoice:   €100,000.00
Quarterly Fee (gross):                 €20,885.97
Credit Applied (prepaid drawn down):  −€20,885.97
Prepaid Balance Remaining:             €79,114.03
─────────────────────────────────────────────────
Quarterly Monitoring Fee (net):                €0
```

For the annual-upfront cycle row, show instead:
```text
Annual Upfront Charged:               €100,000.00
Prepaid Balance After:                €100,000.00
```

Files touched:
- `src/components/dashboard/InvoiceCalculator.tsx` — the SPS waterfall JSX block (currently rendering `spsDiscountBreakdown.upfrontAnnualPayment`, etc.) is rewritten to render `spsAnnualUpfrontBreakdown` when present, fall back to the legacy single-cadence display otherwise.

### 4. Verify end-to-end totals
After the changes, with backfill in place and period Apr 1–Jun 30 2026:
- Total Invoice Amount = €0 (monitoring) + €688 (Satellite Data) = **€688**
- Xero line items emitted: one `−€20,885.97` "Annual Minimum Already Paid" credit line + the €688 add-on line (already implemented in `MergedInvoiceDialog` and `InvoiceCalculator` Xero builders).
- Support document SPS Annual Upfront Billing section shows balance before €100k, credit €20,886, balance after €79,114.

## Out of scope
- No schema changes (re-using existing `ytd_invoiced_amount`, `last_annual_invoice_date`, `annual_billing_anchor_date`).
- No changes to the per-MW + annual-upfront package (separate package, already working).
- ARR display for SPS dual-cadence (pre-existing display quirk, can be addressed later).
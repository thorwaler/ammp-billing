## Audit findings for "Per-MW + Annual Upfront Minimum"

The new package only landed in three places: the contract form, the calculation function, and the DB migration. Several touchpoints in the rest of the app still don't know about it, plus there are some cleanups worth doing.

### Missing wiring (functional gaps)

1. **Contract Types registry** — `src/components/contract-types/PricingModelSelector.tsx` and `ContractTypeForm.tsx`
   - Add `"per_mw_annual_upfront"` to the `PricingModel` union and `PRICING_MODEL_OPTIONS` list.
   - Include it in `showModulesFor` so the modules editor is shown when admins build custom templates with this model.

2. **UpcomingInvoicesList — pass new fields into the calculator** (`src/components/invoices/UpcomingInvoicesList.tsx`)
   - Currently `calculateEstimatedAmount(...)` does not pass `annualMinimumFee`, `committedMinimumMW`, `annualBillingAnchorDate`, `ytdInvoicedAmount`, or `perMWAnnualUpfrontIsAnnualCycle`. Estimates will be wrong for the new package.
   - Extend the contract query (`select`) to include the five new DB columns and forward them into `calculateInvoice`.
   - Add `cycleType` to the list type so the row label can read "Annual upfront" vs "Quarterly overage (YTD over min)".

3. **Invoice creation flow** (`src/components/dashboard/InvoiceCalculator.tsx`, lines ~1357–1470)
   - After a successful invoice insert for a `per_mw_annual_upfront` contract:
     - If the cycle was **annual_upfront**: set `last_annual_invoice_date = invoiceDate`, reset `ytd_invoiced_amount = result.totalPrice`, and set `next_invoice_date` to the next quarterly date (not the next annual date).
     - If the cycle was **quarterly_overage**: increment `ytd_invoiced_amount += result.totalPrice`, and set `next_invoice_date` to the next quarter — unless that next date crosses the anchor month, in which case schedule the annual rollover.
   - The existing single `switch(billingFrequency)` block for `next_invoice_date` is insufficient for the dual-cadence package; add a branch that picks `min(nextAnnualDate, nextQuarterlyDate)` based on the anchor.

4. **Skip-invoice / next-date helpers** in `UpcomingInvoicesList.tsx` (`getNextDate`, `calculateNextInvoiceDate`)
   - Same issue: they only look at `billingFrequency`. For `per_mw_annual_upfront` they need to advance to the next of {annual anchor, next quarterly date}.

5. **Form: minimum-fee read path** (`src/components/contracts/ContractForm.tsx` line ~769)
   - Default `annualMinimumFee` to `60000` is misleading. Default it to `0` and let the user explicitly enter the value (matches how `committedMinimumMW` defaults to 0).

6. **Memory rule for the per-site billing constraint**
   - The per-site billing memory says "UNHCR package forced to monthly billing cycle". The new package is **not** monthly; it's annual + quarterly. No change needed to that memory, but add a one-liner to `mem://features/package-per-mw-annual-upfront.md` (already exists) confirming `billing_frequency` should be stored as `'quarterly'` (since the quarterly cycle is the recurring one), and the annual cycle is driven by `annual_billing_anchor_date`. Update `ContractForm.tsx` save path to force `billing_frequency = 'quarterly'` when this package is selected.

### Cleanup / refactor

7. **Duplicated next-date logic** — three implementations exist (`getNextDate`, `calculateNextInvoiceDate` in `UpcomingInvoicesList.tsx`, and the inline switch in `InvoiceCalculator.tsx` ~line 1364). Extract a single `getNextInvoiceDate(contract, currentDate)` helper in `src/lib/invoiceScheduling.ts` that handles both standard frequencies and `per_mw_annual_upfront`'s dual cadence. Replace the three call sites.

8. **`per_mw_annual_upfront` calc branch placement** (`invoiceCalculations.ts` lines 1229–1289) currently runs *after* the generic totalPrice composition and then overrides it. Move it into a dedicated helper `calculatePerMWAnnualUpfront(...)` returning its own `totalPrice`, called early like the other package-specific branches, so the generic path doesn't compute values that get thrown away.

9. **Type any-casts in ContractForm** (lines 769–771) — read the new fields via the typed `Contract` interface instead of `(existingContract as any)`. Regenerate / extend the `Contract` type in `src/types/contract.ts` (if present) with the five new fields.

10. **Memory index** — confirm `mem://features/package-per-mw-annual-upfront.md` covers: (a) annual cycle stores full floor and resets `ytd_invoiced_amount`, (b) quarterly cycle only charges overage above `max(ytd_invoiced_amount, annualFloor)`, (c) `billing_frequency='quarterly'` is the canonical setting, (d) anchor month drives annual rollover. Patch if missing.

### Out of scope

- No retroactive backfill of `ytd_invoiced_amount` for historical invoices.
- No refund logic when MW drops mid-year.
- Merged-invoice flow doesn't need changes (different currencies/contracts already segregated).

### Suggested implementation order

1. Add to `PricingModelSelector` + `ContractTypeForm.showModulesFor` (1).
2. Extract `getNextInvoiceDate` helper, then use it in `InvoiceCalculator` invoice-creation path with the YTD/anchor logic (3, 4, 7).
3. Forward new fields through `UpcomingInvoicesList.calculateEstimatedAmount` and add cycle-type row label (2).
4. Force `billing_frequency='quarterly'` on save + fix default fee (5, 6).
5. Refactor calc branch into helper, drop `any` casts (8, 9).
6. Update memory doc (10).

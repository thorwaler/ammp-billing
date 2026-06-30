## Goal

For `sps_monitoring` contracts, support an **annual upfront payment with a €100k minimum** (configurable per contract). At the annual anchor date we bill the **full annual portfolio value** (= 4 × the quarterly SPS calculation), floored at the annual minimum. Subsequent quarterly invoices keep their full SPS stacking-discount line items but each quarter's value is offset by a credit line "Annual Upfront Credit Applied", €-for-€, until the prepaid balance is exhausted (true overage thereafter, next anniversary tops up again).

Extends — not replaces — the existing SPS package. Contracts with no annual minimum set keep today's behaviour.

## Annual upfront amount

`annualUpfront = max(annualMinimum, annualPortfolioValue)` where `annualPortfolioValue = quarterlySpsCost × 4`, computed with the existing SPS stacking-discount math.

- Smaller portfolio → upfront = €100k (minimum kicks in).
- Larger portfolio → upfront = real annual value (e.g. €140k).

## Anchor date

The `annual_billing_anchor_date` field on the contract is the user-set date that drives the annual cycle. For SPS this will be configured to **28 Feb 2026** in the contract form — that's the date the upfront annual invoice fires and what subsequent anniversaries (Feb 28, 2027 …) inherit. No special handling needed; the existing `isAnnualUpfrontCycle` helper already matches the anchor month/day against the current period.

## Behaviour by cycle

Reuses existing contract columns (`annual_minimum_fee`, `annual_billing_anchor_date`, `last_annual_invoice_date`, `ytd_invoiced_amount`).

- **Annual upfront cycle** (period contains the anchor date, or first invoice after signed_date when anchor is set):
  - Single line `Annual Platform Fee — SPS Monitoring (max of portfolio €X and minimum €100,000)`, amount = `annualUpfront`.
  - SPS stacking module/discount lines suppressed for this cycle only.
  - `ytd_invoiced_amount := annualUpfront`, `last_annual_invoice_date := cycle date`.
- **Quarterly cycles** (non-anchor):
  - Existing SPS stacking calculation runs unchanged — all monitoring + discount lines as today.
  - Append a single credit line `Annual Upfront Credit Applied (€X of €Y remaining)`, amount = `−min(quarterCost, ytdInvoiced)`. `ytd_invoiced_amount` is treated as the remaining prepaid balance, decremented each quarter.
  - Net invoice = `max(0, quarterCost − creditApplied)`.
  - On creation: `ytd_invoiced_amount -= creditApplied`. Once balance hits 0, future quarters bill at full value (true overage).
- Anniversary reset: any leftover balance from the prior year is preserved (anniversary adds the new annual amount on top). If the user later wants leftover forfeited, this is a one-line change — flagging during build.

## Files

1. **`src/components/contracts/ContractForm.tsx`**
   - When `package === 'sps_monitoring'`, surface the existing annual-upfront fields (`annual_minimum_fee`, `annual_billing_anchor_date`) labelled "Annual minimum (billed upfront, €100k default)" and "Annual billing anchor date". Optional; leaving `annual_minimum_fee` blank = today's behaviour.

2. **`src/lib/invoiceCalculations.ts`** (`sps_monitoring` branch ~line 1019)
   - Compute quarterly SPS cost as today.
   - If `annualMinimumFee > 0`:
     - `annualPortfolioValue = quarterCost × 4`; `annualUpfront = max(annualMinimumFee, annualPortfolioValue)`.
     - **Annual cycle** (`spsAnnualUpfrontIsAnnualCycle === true` or anchor-month match): override `totalPrice = annualUpfront`; populate `result.spsAnnualUpfrontBreakdown = { cycleType: 'annual_upfront', annualMinimum, annualPortfolioValue, annualUpfront }`.
     - **Quarterly cycle**: `creditApplied = min(quarterCost, max(0, ytdInvoiced))`; `result.spsAnnualUpfrontBreakdown = { cycleType: 'quarterly_credit', annualMinimum, ytdRemainingBefore: ytdInvoiced, grossQuarterCost: quarterCost, creditApplied, netAfterCredit: quarterCost − creditApplied }`; `result.totalPrice -= creditApplied`.
   - New optional input `spsAnnualUpfrontIsAnnualCycle?: boolean`.

3. **`src/components/dashboard/InvoiceCalculator.tsx`**
   - When `package === 'sps_monitoring'` and `annualMinimumFee > 0`, pass `annualMinimumFee`, `ytdInvoicedAmount`, `annualBillingAnchorDate`, and derive `spsAnnualUpfrontIsAnnualCycle` via `isAnnualUpfrontCycle`.
   - Xero line items:
     - Annual cycle → suppress SPS module/discount lines, emit `Annual Platform Fee — SPS Monitoring (max of portfolio €X and minimum €Y)` = `annualUpfront`.
     - Quarterly cycle → keep all SPS lines, append `Annual Upfront Credit Applied (€creditApplied of €ytdRemainingBefore remaining)` with negative UnitAmount, same Platform Fees account.
   - On invoice creation atomically update `ytd_invoiced_amount` (`= annualUpfront` annual / `-= creditApplied` quarterly) and `last_annual_invoice_date` (set only on annual cycles).

4. **`src/components/invoices/MergedInvoiceDialog.tsx`** — same per-contract treatment (line items + DB update).

5. **`src/lib/supportDocumentGenerator.ts` + `src/components/invoices/SupportDocument.tsx`**
   - Extend `SupportDocumentData` with `spsAnnualUpfrontBreakdown`.
   - Annual cycle: dedicated "Annual Platform Fee — SPS Monitoring" section showing the max formula; asset table shown for reference, period total = `annualUpfront`.
   - Quarterly cycle: existing SPS section unchanged, plus a "Annual Upfront Credit Applied" row (`−creditApplied`) and a footnote "Prepaid balance remaining: €X of original €Y".

6. **`src/components/invoices/UpcomingInvoicesList.tsx`** — pass the same fields through for `sps_monitoring` rows so previews are correct.

## Out of scope

- No schema changes (columns already exist).
- No change to per_mw_annual_upfront behaviour.
- No change to SPS stacking-discount math.

## Verification (anchor = 28 Feb 2026)

Portfolio value €120k/year (€30k/qtr):
- **28 Feb 2026**: annualUpfront = max(100k, 120k) = €120k, single line, ytd = 120k.
- **May 2026** quarter: gross €30k, credit −€30k, net €0, ytd = 90k.
- **Aug 2026**: gross €30k, credit −€30k, net €0, ytd = 60k.
- **Nov 2026**: gross €30k, credit −€30k, net €0, ytd = 30k.
- **28 Feb 2027**: anniversary → new annual upfront billed on top, ytd refreshed (carry-over behaviour to confirm in build).

Smaller portfolio (€80k/year): 28 Feb 2026 upfront = €100k (minimum); all 4 quarters fully credited; €20k credit carries (subject to carry-over decision).

SPS contracts without `annual_minimum_fee` → unchanged. SolarX (per_mw_annual_upfront) → unchanged.

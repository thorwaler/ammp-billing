
## How the two minimum fields relate

- **Minimum Annual Contract Value** (`minimum_annual_value`) — the original, generic field. Already drives the SPS €100k floor today.
- **Fixed Annual Minimum** (`annual_minimum_fee`) — a newer field added for the Per‑MW + Annual Upfront (SolarX) package, which also needs an anchor date and YTD tracking.

They mean the same thing conceptually. To avoid two fields that do the same job on the same contract, we'll **reuse `minimum_annual_value` for SPS** and only add what's actually missing: the annual anchor date.

## Changes

### 1. Contract form — SPS Monitoring section
File: `src/components/contracts/ContractForm.tsx` (inside the existing `watchPackage === "sps_monitoring"` block, ~line 1350)

Add one new sub‑section "Annual Upfront Billing" with:
- **Annual Anchor Date** (`annualBillingAnchorDate`) — date picker, optional. Helper text: "If set, the full annual SPS fee (or €100k minimum, whichever is higher) is billed upfront on this date each year. Subsequent quarterly invoices apply a credit until the prepaid balance is exhausted."
- A read‑only info line referencing the existing **Minimum Annual Contract Value** above: "Annual upfront amount = max(Minimum Annual Contract Value, full annual SPS portfolio value)."

No new "Fixed Annual Minimum" input for SPS — we reuse `minimum_annual_value`.

Persist `annual_billing_anchor_date` on save for the `sps_monitoring` package (extend the existing save mapping that currently gates it behind `isAnnualUpfront`).

### 2. Calculation wiring
File: `src/lib/invoiceCalculations.ts` — `sps_monitoring` branch

Replace the current "bill excess pro‑rated forever" logic (lines ~1044‑1051) with a real dual‑cadence prepaid‑balance model, driven by the new `spsIsAnnualCycle` flag:

- **Annual cycle** (`invoiceDate` matches anchor month/day): one line = `max(minimumAnnualValue, annualDiscountedFee)`; suppress per‑module SPS lines. Caller resets `ytd_invoiced_amount` to this amount.
- **Quarterly cycle**: bill the full quarter normally (`annualDiscountedFee / 4`, all module lines visible); emit a negative **"Annual Minimum Already Paid"** credit of `min(quarterCost, remainingPrepaidBalance)`, where `remainingPrepaidBalance = max(0, ytdInvoiced − ytdConsumed)`. Caller increments `ytd_invoiced_amount` consumption.

Add `spsAnnualUpfrontBreakdown` to the result interface mirroring `perMWAnnualUpfrontBreakdown`.

### 3. Invoice Calculator
File: `src/components/dashboard/InvoiceCalculator.tsx`

- In `buildCalculationParams`: set `spsIsAnnualCycle` via `isAnnualUpfrontCycle(invoiceDate, anchor)` when package is `sps_monitoring`.
- In the post‑Xero contract update block (lines ~1430‑1497): extend the `isAnnualUpfrontContract` branch to also trigger for `sps_monitoring` when the anchor is set, so YTD reset/increment runs.
- In the Xero line‑item builder: when `spsAnnualUpfrontBreakdown` is present, emit either the single "Annual Platform Fee — Minimum" line (annual cycle) or append the negative credit line (quarterly cycle).

### 4. Support document + merged invoices
- `src/lib/supportDocumentGenerator.ts`: add an `sps_monitoring` annual‑upfront branch that shows either the floor calc (annual) or the credit line (quarterly).
- `src/components/invoices/SupportDocument.tsx`: render the new breakdown section.
- `src/components/invoices/MergedInvoiceDialog.tsx`: mirror the Xero line‑item logic.

### 5. Set the SPS contract values

Per your confirmation, after the form change ships, set on contract `460a2fc6-af1b-401f-8b91-aaaccdfc98e3` (SPS Investments Seychelles Ltd, sps_monitoring):
- Minimum Annual Contract Value: **€100,000** (already the intent; please confirm via form)
- Annual Anchor Date: **2026‑02‑28**

I can also pre‑seed those two values directly in the database in the same change if you'd like — just say the word.

## No schema migration needed

`annual_billing_anchor_date` and `ytd_invoiced_amount` already exist on `contracts`. No new columns.

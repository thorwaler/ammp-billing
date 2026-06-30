## Goal

Make SPS Monitoring discounts additive — every discount (volume, upfront, commitment) applies to the original pre-discount fee, not to the running discounted base. The per-MW / per-kWp rate shown in the support document must follow the same additive logic on top of the €900/MW base rate.

## Current behavior (bug)

In `src/lib/invoiceCalculations.ts` (lines 1043–1056), all three SPS discounts stack multiplicatively:
- Volume → applied to preDiscount
- Upfront → applied to `preDiscount − volume`
- Commitment → applied to `preDiscount − volume − upfront`

So a 5% + 3% combo on €100,734.17 gives less than (5% + 3%) of €100,734.17 because each later discount sees a shrunken base.

## Desired behavior

All discounts apply to the **original** `preDiscountAnnualFee`:
- `volumeDiscountAmount     = preDiscount × volume% / 100`
- `upfrontDiscountAmount    = preDiscount × upfront% / 100`
- `commitmentDiscountAmount = preDiscount × commitment% / 100`
- `annualDiscountedFee      = preDiscount − (volumeAmt + upfrontAmt + commitmentAmt)`

Example on the attached doc (pre-discount €100,734.17, 5% + 3%, 0% commitment):
- Volume 5% → €5,036.71 (taken from €100,734.17)
- Upfront 3% → €3,022.03 (taken from €100,734.17, **not** from €95,697.46)
- Final annual → €92,675.44

## Per-MW / per-kWp rate in the support document

`src/lib/supportDocumentGenerator.ts` (~line 890) derives the SPS blended rate as `annualDiscountedFee / totalMW`. Once the discount math is additive at the source, this rate automatically reflects the additive formula:

`effectiveRate = €900/MW × (1 − (volume% + upfront% + commitment%) / 100)`

No extra computation is needed in the support doc — the existing divide-by-MW path is already correct as long as `annualDiscountedFee` is fixed upstream. Verify after the change that per-site €/kWp · €/Year sum to `annualDiscountedFee`.

## Changes

### `src/lib/invoiceCalculations.ts` (~lines 1043–1056)
Replace sequential math with additive math. Keep existing field names so PDF / UI consumers (`PdfRenderer.tsx` 370–374, `InvoiceCalculator.tsx` 2817+, `supportDocumentGenerator.ts` 549+) keep working:

```ts
const volumeDiscountAmount     = preDiscountAnnualFee * (volumeDiscountPercent / 100);
const upfrontDiscountAmount    = preDiscountAnnualFee * (upfrontDiscountPercent / 100);
const commitmentDiscountAmount = preDiscountAnnualFee * (commitmentDiscountPercent / 100);

const afterVolumeDiscount   = preDiscountAnnualFee - volumeDiscountAmount;
const afterUpfrontDiscount  = afterVolumeDiscount   - upfrontDiscountAmount;
const annualDiscountedFee   = afterUpfrontDiscount  - commitmentDiscountAmount;
```

The running `afterVolumeDiscount` / `afterUpfrontDiscount` subtotals are still mathematically valid because each `*Amount` is now anchored to `preDiscount` — the PDF rows ("After Volume Discount", "After Upfront Discount") remain meaningful waypoints.

### No other code edits
- Support doc per-MW / per-kWp rate is already derived from `annualDiscountedFee` and updates automatically.
- Type definitions unchanged.
- PDF and calculator UI unchanged.

### Memory update
Update `mem://features/package-sps-monitoring` (or its index entry) with: "All SPS discounts (volume, upfront, commitment) are additive against the pre-discount annual fee — never sequential. Per-MW rate in support docs follows the same rule."

## Out of scope

- No change to dual-cadence (annual upfront vs quarterly credit), minimum fee handling, or prepaid balance logic.
- No backfill of historical invoices — they were generated under the old multiplicative rule. Recalculations / future invoices will use the additive formula.

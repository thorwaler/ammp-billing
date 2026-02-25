

## Combined SPS Monitoring Cleanup and Fixes

This plan merges all outstanding SPS issues into a single implementation pass.

### 1. Fix Minimum Annual Value Logic (Critical)

The €100,000 minimum is paid **upfront annually**, so quarterly invoices should only charge the **excess** beyond that prepayment.

**`src/lib/invoiceCalculations.ts`** (SPS branch):
- Calculate the full **annual** discounted monitoring fee (not quarterly)
- Apply the three stacking discounts on the annual figure
- Compare against `minimumAnnualValue`:
  - If annual fee ≤ minimum → quarterly monitoring fee = €0 (covered by upfront)
  - If annual fee > minimum → quarterly monitoring fee = `(annualFee - minimumAnnualValue) / 4`
- Update `spsDiscountBreakdown` to include `annualDiscountedFee`, `upfrontAnnualPayment`, `excessAnnualAmount`, and `quarterlyExcess`

```text
annualFee = totalMW × rate × 1.0 → Volume → Upfront → Commitment
if annualFee ≤ 100,000:
    quarterlyMonitoring = 0
else:
    quarterlyMonitoring = (annualFee - 100,000) / 4
+ Add-ons + One-time fees = Quarterly Invoice
```

### 2. Use SPS_ADDONS in InvoiceCalculator

**`src/components/dashboard/InvoiceCalculator.tsx`**:
- When building the addon selection list, check `isSpsPackage` and use `SPS_ADDONS` instead of the legacy `ADDONS` array
- Pass `SPS_ADDONS` as `customAddonDefinitions` to `calculateInvoice()` so SPS-specific prices (e.g., Satellite Data at €2.7/site, Custom Dashboard at €900) are used in calculations
- This also resolves the lint warning for the unused `SPS_ADDONS` import

### 3. Add SPS Discount Breakdown Display

**`src/components/dashboard/InvoiceCalculator.tsx`** (results section):
- Add a conditional block (like the existing SolarAfrica breakdown) that renders when `result.spsDiscountBreakdown` is present
- Show the discount waterfall:

```text
Annual Monitoring Fee (pre-discount):  €X,XXX
Volume Discount (XX%):                -€X,XXX
Upfront Discount (X%):                -€XXX
Commitment Discount (X%):             -€XXX
Annual Discounted Fee:                 €X,XXX
Upfront Annual Payment:               €100,000
Excess Annual Amount:                  €X,XXX (or €0)
Quarterly Monitoring Fee:              €X,XXX
```

### 4. Update Support Document Generator

**`src/lib/supportDocumentGenerator.ts`**:
- Add SPS awareness: when the package is `sps_monitoring`, include the discount waterfall lines in the support document data
- Show the upfront payment vs. excess breakdown so the client sees how their quarterly invoice was derived

### Files Changed

| File | Change |
|------|--------|
| `src/lib/invoiceCalculations.ts` | Rework SPS branch to calculate annual fee first, subtract upfront minimum, pro-rate excess; update spsDiscountBreakdown fields |
| `src/components/dashboard/InvoiceCalculator.tsx` | Use `SPS_ADDONS` for addon selection and calculation; add discount waterfall display in results |
| `src/lib/supportDocumentGenerator.ts` | Add SPS discount breakdown to support document output |


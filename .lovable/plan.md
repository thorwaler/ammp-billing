

## Updated Plan: SPS Monitoring Package -- Billing Frequency Change

The previously approved plan for the SPS Monitoring package is unchanged except for one correction:

**Change**: The default `billingFrequency` for `sps_monitoring` contracts will be set to `"quarterly"` instead of `"annual"`.

This affects the following locations in the original plan:

| File | What changes |
|------|-------------|
| `src/components/contracts/ContractForm.tsx` | In the `handlePackageChange` branch for `sps_monitoring`, set `billingFrequency` to `"quarterly"` |
| `src/lib/invoiceCalculations.ts` | The frequency multiplier will naturally use 0.25 for quarterly, so the minimum annual value comparison must divide by 4 (compare quarterly invoice against `minimumAnnualValue / 4`, or equivalently annualize before comparing) |

The calculation flow becomes:

```text
Base Cost = totalMW x moduleRate x 0.25 (quarterly)
  → Apply Volume Discount
  → Apply Upfront Discount (5%)
  → Apply Commitment Discount (3%)
  = Discounted Quarterly Fee
  → Compare with Minimum Annual Value / 4 (= €25,000/quarter)
  → Use the greater of the two
  + Add-ons + One-time fees
  = Quarterly Invoice
```

Everything else from the original plan (database migration, pricing data, invoice calculator, analytics, support documents) remains the same.


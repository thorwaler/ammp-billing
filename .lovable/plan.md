

## Fix SPS ARR Calculation

### Problem

For SPS Monitoring, `calculateInvoice()` with `frequencyMultiplier=1` returns the **excess** above the upfront annual payment: `max(0, €27,632 - €100,000) = €0`. This means `calculateSingleContractARR()` reports €0 for the SPS contract.

The actual annual recurring revenue is `max(annualDiscountedFee, minimumAnnualValue)` — i.e., the higher of the calculated monitoring fee or the guaranteed minimum. In this case, €100,000.

### Fix

**File: `src/services/analytics/dashboardAnalytics.ts`** (~line 339)

After `annualValue = result.totalPrice`, add SPS-specific logic:

```typescript
annualValue = result.totalPrice;

// For SPS Monitoring, the invoice engine returns only the EXCESS above
// the upfront annual payment. For ARR, the actual annual revenue is
// whichever is higher: the full discounted monitoring fee or the minimum.
if (contract.package === 'sps_monitoring' && contract.minimum_annual_value) {
  annualValue = Math.max(
    annualValue + contract.minimum_annual_value,
    contract.minimum_annual_value
  );
}
```

Since `annualValue` (excess) + `minimum_annual_value` equals the full discounted fee when the fee exceeds the minimum, and equals just the minimum when excess is 0, this correctly represents `max(discountedFee, minimum)`.

**Also fix `getTotalContractARR()` query** (lines 1210-1233): Add the 8 missing fields so the Reports page produces the same result as the Dashboard.

### Expected Impact

- SPS ARR: €0 → €100,000
- Reports page gap (missing fields): additional ~€5k correction
- New total ARR: ~€1,081k

### Files changed

| File | Change |
|------|--------|
| `src/services/analytics/dashboardAnalytics.ts` | Add SPS minimum_annual_value to ARR; add 8 missing fields to Reports query |


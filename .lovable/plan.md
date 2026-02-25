

## Fix: SPS Discount Values Not Reaching Invoice Calculator

### Root Cause (3 layers)

1. **Database still has `0`** -- The previous DB update was planned but the contract still stores `upfront_discount_percent = 0` and `commitment_discount_percent = 0`.

2. **ContractForm loading (lines 358-363)** -- When editing an existing SPS contract, the code checks `if (existingContract.upfrontDiscountPercent !== undefined)` and sets the value. Since `0 !== undefined` is true, it sets the state to `0`. The `|| 5` fix on line 711 only runs when the user **changes** the package dropdown, not when loading an existing contract.

3. **InvoiceCalculator (lines 374-375)** -- `Number(0) || undefined` evaluates to `undefined` because `0` is falsy. So the discount values are passed as `undefined` to the calculation engine, and no discounts are applied.

### Fix

**1. Update the existing SPS contract in the database**

```sql
UPDATE contracts 
SET upfront_discount_percent = 5, commitment_discount_percent = 3
WHERE package = 'sps_monitoring' 
  AND (upfront_discount_percent = 0 OR upfront_discount_percent IS NULL);
```

**2. Fix ContractForm loading logic (lines 358-363)**

When loading an existing SPS contract, treat `0` as "not yet configured" and apply defaults:

```typescript
// Initialize SPS Monitoring discount state
if (existingContract.package === 'sps_monitoring') {
  setUpfrontDiscountPercent(existingContract.upfrontDiscountPercent || 5);
  setCommitmentDiscountPercent(existingContract.commitmentDiscountPercent || 3);
} else {
  if (existingContract.upfrontDiscountPercent !== undefined) {
    setUpfrontDiscountPercent(existingContract.upfrontDiscountPercent);
  }
  if (existingContract.commitmentDiscountPercent !== undefined) {
    setCommitmentDiscountPercent(existingContract.commitmentDiscountPercent);
  }
}
```

**3. Fix InvoiceCalculator data mapping (lines 374-375)**

Use nullish coalescing (`??`) instead of `||` so that `0` is preserved as a valid number rather than falling to `undefined`:

```typescript
upfrontDiscountPercent: (contract as any).upfront_discount_percent ?? undefined,
commitmentDiscountPercent: (contract as any).commitment_discount_percent ?? undefined,
```

This ensures that if the DB value is `0`, it's passed as `0` (not silently dropped). Combined with the DB fix, SPS contracts will have `5` and `3` in the database, so they'll flow through correctly.

### Files Changed

| File | Change |
|------|--------|
| Database (contracts table) | Set `upfront_discount_percent=5`, `commitment_discount_percent=3` for existing SPS contracts with `0` |
| `src/components/contracts/ContractForm.tsx` | Fix loading logic (lines 358-363) to default SPS discounts when `0` |
| `src/components/dashboard/InvoiceCalculator.tsx` | Fix lines 374-375 to use `??` instead of `\|\|` so `0` is not dropped |




## Fix: SPS Discount Defaults Not Applied

### Root Cause

The contract "SPS 2026" was saved to the database with `upfront_discount_percent = 0` and `commitment_discount_percent = 0`. This happened because:

1. The initial state in `ContractForm.tsx` (line 240-241) defaults both values to `0`
2. When the user selected `sps_monitoring` as package type, the `handlePackageChange` function runs:
   ```
   setUpfrontDiscountPercent(existingContract?.upfrontDiscountPercent ?? 5)
   ```
3. If there's no existing contract (new contract creation), `existingContract` is undefined, so `?? 5` correctly falls back to 5%
4. **However**, if the contract was created before these fields existed, or if the user saved the form before switching to `sps_monitoring`, the values were already `0` in state and got saved as `0`

The DB confirms: `upfront_discount_percent: 0`, `commitment_discount_percent: 0`.

### Fix

Two changes are needed:

**1. Update the existing contract in the database**

Run a migration to set the correct defaults for existing SPS contracts that have `0`:

```sql
UPDATE contracts 
SET upfront_discount_percent = 5, commitment_discount_percent = 3
WHERE package = 'sps_monitoring' 
  AND (upfront_discount_percent = 0 OR upfront_discount_percent IS NULL)
  AND (commitment_discount_percent = 0 OR commitment_discount_percent IS NULL);
```

**2. Fix the default state initialization** in `ContractForm.tsx`

Change the initial `useState` defaults from `0` to detect the package context:

- When `handlePackageChange` sets `sps_monitoring` on a **new** contract, always use `5` and `3` as defaults (not conditional on `existingContract`)
- When editing an existing SPS contract that already has values, use those values

The fix is in `handlePackageChange` (line 711-712): change `?? 5` to a check that also treats `0` as "not yet configured" for new SPS contracts:

```typescript
setUpfrontDiscountPercent(existingContract?.upfrontDiscountPercent || 5);
setCommitmentDiscountPercent(existingContract?.commitmentDiscountPercent || 3);
```

Using `||` instead of `??` means `0` will also fall back to the default. This is safe because a 0% discount is equivalent to "no discount" and the user can still manually set it to 0 if desired by typing in the field.

### Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/...` | Update existing SPS contracts to have 5% upfront and 3% commitment |
| `src/components/contracts/ContractForm.tsx` | Change `??` to `\|\|` for SPS discount defaults on lines 711-712 |


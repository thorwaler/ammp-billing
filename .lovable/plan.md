## Problem

Creating a contract fails with:

```text
null value in column "org_pricing_config" of relation "contracts" violates not-null constraint
```

## Cause (verified)

`contracts.org_pricing_config` is `jsonb NOT NULL DEFAULT '{}'` (migration `20260729133553`). In `src/components/contracts/ContractForm.tsx` (line 1150) the payload sets:

```
org_pricing_config: data.package === 'elum_ci_lite' ? { liteBaseRate, liteEconfRate } : null
```

For every non-`elum_ci_lite` package (the failing case was C&I Pro) an explicit `null` is sent, which overrides the column default and violates the constraint.

## Fix

In `ContractForm.tsx`, change the non-Lite branch from `null` to `{}` so the column always receives a valid JSON object. Same value applies for both the insert and update paths built from this payload.

## Verification

Create a C&I Pro contract and confirm it saves; re-check that an `elum_ci_lite` contract still stores its lite base/eConf rates and that `contractFormMapping.ts` still reads them back correctly (it already guards with `row.org_pricing_config || {}`).

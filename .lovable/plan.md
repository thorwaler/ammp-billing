

## Bug: AMMP Sync Overwrites Onboarding Dates with NULL

### Root Cause

In `supabase/functions/ammp-sync-contract/index.ts` line 748, the `populateSiteBillingStatus` function updates existing site records and sets `onboarding_date: asset.onboardingDate || null`. When the AMMP API returns no `created` date for an asset, this overwrites previously valid onboarding dates with NULL.

Three UNHCR sites are affected: Beirut, Farchana, Hadjer_Hadid -- all have `onboarding_date = NULL` in `site_billing_status`.

### Fix

**1. Edge Function Fix** (`supabase/functions/ammp-sync-contract/index.ts`, line 748)

Only update `onboarding_date` when the AMMP API actually returns a value. Never overwrite a non-null date with null:

```typescript
// Before (line 748):
onboarding_date: asset.onboardingDate || null,

// After:
...(asset.onboardingDate ? { onboarding_date: asset.onboardingDate } : {}),
```

**2. Data Repair** (migration)

Set missing onboarding dates to the record's `created_at` timestamp as a reasonable fallback:

```sql
UPDATE site_billing_status
SET onboarding_date = created_at
WHERE onboarding_date IS NULL;
```

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/ammp-sync-contract/index.ts` | Don't overwrite onboarding_date with null on existing records |
| `src/services/ammp/ammpService.ts` | Same fix in the client-side `populateSiteBillingStatus` function (line ~218) |
| Database migration | Backfill NULL onboarding dates with `created_at` |


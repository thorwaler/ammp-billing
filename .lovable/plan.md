
## What’s happening (root cause)

You’re seeing **two separate issues** that stem from the new `hybrid_tiered_assetgroups` package being only partially wired in:

1) **Contract creation fails** because the backend has a database check constraint `contracts_package_check` that does **not** yet allow the value `hybrid_tiered_assetgroups`.  
   - Error (confirmed in backend logs): `violates check constraint "contracts_package_check"`

2) **Technical Monitoring can still be selected** because the UI component that disables modules for `hybrid_tiered` was not extended to also cover `hybrid_tiered_assetgroups`.

---

## Fix plan (no new tables needed)

### A) Backend: allow the new package value (required to create contracts)
**Goal:** Update the `contracts_package_check` constraint to include `hybrid_tiered_assetgroups`.

- Current constraint definition is:
  - `package = ANY (ARRAY['starter','pro','custom','hybrid_tiered','capped','poc','per_site','elum_epm','elum_jubaili','elum_portfolio_os','elum_internal'])`
- We will:
  1. Drop the existing constraint `contracts_package_check`
  2. Recreate it with the same allowed list **plus** `'hybrid_tiered_assetgroups'`

**Why this is safe:**  
- The `package` column is `text`, so this is just updating validation rules.
- This change is backwards compatible with existing rows (it only broadens allowed values).

**Important note about Live vs Test:**  
- If you have already published the UI but not the database constraint, Live users will also fail to create contracts of this type until the constraint is updated in Live as well. We’ll apply this change via a migration so it can be published cleanly.

---

### B) Frontend: prevent selecting “Technical Monitoring” for hybrid tiered packages
**Goal:** Make the behavior consistent with `hybrid_tiered`:
- For both `hybrid_tiered` **and** `hybrid_tiered_assetgroups`, “Technical Monitoring” should be disabled/not selectable.

We will implement this in two layers (belt + suspenders):

1) **UI disable logic in `ContractPackageSelector.tsx`**
   - Update the module disable logic to treat:
     - `selectedPackage === "hybrid_tiered_assetgroups"` the same as `"hybrid_tiered"` for `technicalMonitoring`.

2) **Guard in `ContractForm.tsx` inside `handleModuleSelection`**
   - Even if something re-enables it later, we prevent adding `technicalMonitoring` to `modules` when the package is hybrid tiered (either variant).
   - Optionally show a small toast like: “Technical Monitoring is included in the hybrid tiered base rate.”

3) (Already present) **On package change**
   - `handlePackageChange()` already removes `technicalMonitoring` for both packages; we’ll keep that and ensure it stays correct.

---

## Validation / Test checklist (what you should verify after implementation)

1) Go to Customers → Create Contract
2) Choose package: **Hybrid Tiered + Asset Groups**
3) Confirm:
   - Contract saves successfully (no backend constraint error)
   - “Technical Monitoring” is disabled and cannot be checked
4) Confirm asset group fields appear and save (Primary / AND / NOT)
5) Confirm invoice calculations still behave like `hybrid_tiered` (TM not billed as a module)

---

## Files / areas that will be changed

### Backend migration
- Update `contracts_package_check` constraint in the database.

### Frontend
- `src/components/contracts/ContractPackageSelector.tsx`
  - Extend disable condition to include `hybrid_tiered_assetgroups`
- `src/components/contracts/ContractForm.tsx`
  - Add a guard in `handleModuleSelection()` to block `technicalMonitoring` for both hybrid tiered packages
  - (Optional) toast message to explain why it’s blocked

---

## Expected outcome

- Contracts with `package = 'hybrid_tiered_assetgroups'` can be created successfully.
- “Technical Monitoring” is no longer selectable for that package (matching hybrid tiered behavior).
- The rest of the hybrid tiered pricing logic and asset group filtering UX remains intact.

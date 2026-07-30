## Duplicate a contract

Add a "Duplicate" action that opens the contract form prefilled with everything from an existing contract, letting you pick the target customer and adjust name/dates before saving. Nothing is written until you submit.

### Where the action appears
- `src/components/contracts/ContractList.tsx` — a Copy icon button in the row actions, next to Edit / View / Sync.
- `src/pages/ContractDetails.tsx` — a "Duplicate" button in the header action row, next to Edit.

### New component: `src/components/contracts/DuplicateContractDialog.tsx`
- Loads the source contract row and maps it through the existing `mapContractRowToFormValues` helper in `src/lib/contractFormMapping.ts`, so every pricing field (modules, addons, tiers, Elum org config, thresholds, discounts, freeze/zero-PV settings) carries over correctly and no field silently resets.
- A customer selector at the top, defaulting to the source contract's customer (reusing the pattern from `MoveContractDialog`).
- Renders `ContractForm` in create mode with the mapped values, so the user reviews and edits before saving as a brand-new contract.

### Fields reset on the copy
- Identity: new id, contract name prefilled as `<name> (Copy)`.
- AMMP sync state (per your choice): `cached_capabilities`, `ammp_asset_ids`, `ammp_sync_status`, `last_ammp_sync` cleared so the new contract syncs fresh. The asset-group / org-ID configuration itself is kept, since that's pricing setup.
- Not carried over automatically: contract PDF, OCR data, and amendments (those belong to the original document); billing progress fields (`next_invoice_date`, `ytd_invoiced_amount`, `last_annual_invoice_date`, `last_anniversary_notice_sent_at`) start clean.
- Period dates and signed date are left editable in the form rather than blindly copied.

### After saving
Toast confirmation, list/details refresh, and navigation to the new contract so you can run an AMMP sync straight away.

### Files touched
- `src/components/contracts/DuplicateContractDialog.tsx` (new)
- `src/components/contracts/ContractList.tsx`
- `src/pages/ContractDetails.tsx`
- `src/lib/contractFormMapping.ts` (small helper to strip identity/sync fields)

No database changes required.

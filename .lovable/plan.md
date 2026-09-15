# Fix: custom annual fees disappearing on contract save

## What is happening

The annual fee is saved correctly the first time, but it is wiped whenever the contract is opened and saved again from the contract page, the contract list, or a customer card.

Cause (confirmed by reading the code): the shared helper that loads a saved contract into the edit form (`src/lib/contractFormMapping.ts`) does not copy the `custom_recurring_addons` column. So the editing screen opens with an empty fee list, and saving writes that empty list back over the stored fee. The fee only survives when the form loads the contract itself (the path used when no contract is passed in), which is why it looks intermittent.

Two smaller contributors:
- The form seeds its fee list only once, from a camelCase property (`customRecurringAddons`) that the mapper never produces.
- Duplicating a contract loses the fees for the same reason.

## The fix

1. Add `customRecurringAddons` to the mapper's output (and its type), reading `custom_recurring_addons` and defaulting to an empty list. Duplicates then inherit fees automatically.
2. In the contract form, keep the fee list in sync when contract data arrives (set it in the same effect that populates the other fields) instead of relying on the one-time initial value, so it also works when the form mounts before the data loads.
3. Guard the save: when a contract is being edited and the fee list is empty only because nothing loaded, do not write an empty array over existing data — the sync in step 2 makes the loaded state authoritative, and the filter that drops unnamed/zero fees stays as-is for real removals.

## Cleanup / refactor from the annual-fee change

- Three places (`InvoiceCalculator.tsx`, `UpcomingInvoicesList.tsx`, `invoiceRevision.ts`) each repeat the same `Array.isArray(row.custom_recurring_addons) ? ... : []` parsing. Replace with one exported helper (e.g. `parseCustomRecurringAddons(row)`) in `src/lib/invoiceCalculations.ts` and use it everywhere, including the new mapper field.
- Remove the `(existingContract as any)` casts around the fee list once the field is properly typed in `ContractFormValues`.
- Keep the normalisation (trim title, numeric amount, drop empty/zero rows) in one place so the form save and the calculator agree.

No change to pricing behaviour: fees remain their own invoice line, count toward the annual minimum before top-up, and map to Xero Platform Fees 1002.

## Verification

- Open an existing contract with a fee from the contract detail page, save without touching the fee, confirm it is still stored.
- Duplicate a contract with a fee and confirm the copy keeps it.
- Type check and build.

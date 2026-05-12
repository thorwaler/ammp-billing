## Goal

Fix two leftover issues from the Elum invoice-lead-time work:
1. Editing a contract from the Contracts list or Customer card shows `0` in the "Invoice Creation Lead Time" field even when the contract is stored as `45` (e.g. the Jubaili contract).
2. The form help text still says "Defaults to 45 for Elum packages", which is no longer true.

## Root cause for the `0` display

`ContractDetails.tsx` correctly maps `invoice_lead_days` into `existingContract.invoiceLeadDays` before handing the contract to `ContractForm`. But the two other entry points that open the edit dialog do NOT include that field in the object they pass:

- `src/components/contracts/ContractList.tsx` — `setSelectedContract({...})` at lines ~189–235 omits `invoiceLeadDays` (and the "Edit" button on the /contracts page goes through this path).
- `src/components/customers/CustomerCard.tsx` — `existingContract={{...}}` at lines ~474–514 omits `invoiceLeadDays` (and `invoicingType`).

Because the field is missing, `ContractForm`'s `defaultValues` falls through to `existingContract.invoiceLeadDays ?? 0`, so the input renders `0` even though the database row has `45`.

## Changes

### 1. `src/components/contracts/ContractList.tsx`
In the `setSelectedContract({...})` object (around line 189–235), add:
```ts
invoiceLeadDays: data.invoice_lead_days,
```

### 2. `src/components/customers/CustomerCard.tsx`
In the `existingContract={{...}}` object passed to `ContractForm` (around line 474–514), add:
```ts
invoicingType: selectedContractForEdit.invoicing_type,
invoiceLeadDays: selectedContractForEdit.invoice_lead_days,
```
(`invoicingType` was also missing and would have the same kind of bug.)

### 3. `src/components/contracts/ContractForm.tsx`
Update the `FormDescription` for the `invoiceLeadDays` field (line 2178) to drop the now-stale sentence:

Before:
> Surface this invoice in Upcoming Invoices N days before the actual invoice date and sort it by that "create by" date. The invoice itself still carries the next invoice date. Defaults to 45 for Elum packages.

After:
> Surface this invoice in Upcoming Invoices N days before the actual invoice date and sort it by that "create by" date. The invoice itself still carries the next invoice date.

## Out of scope

- No database changes (the Jubaili contract already has `45` in the database — verified).
- No changes to the Upcoming Invoices list, sorting, or the "Create by" badge.
- No changes to the package selector logic — the auto-default to 45 was already removed in the previous step.

## Files touched

- `src/components/contracts/ContractList.tsx`
- `src/components/customers/CustomerCard.tsx`
- `src/components/contracts/ContractForm.tsx`

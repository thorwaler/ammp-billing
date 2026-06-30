## Move contract to a different customer

Add the ability to reassign an existing contract to another customer from the Edit Contract form.

### UX

- In `ContractForm.tsx`, when editing an existing contract, show a small "Move to different customer" link/button next to the (read-only) Company Name field.
- Clicking it opens a confirmation dialog with:
  - A searchable customer dropdown (existing customers, excluding the current one)
  - Warning text explaining the impact: invoices, billing periods, amendments, and AMMP sync history stay attached to the contract, but will now appear under the new customer
  - Confirm / Cancel buttons
- On confirm: update `contracts.customer_id` to the selected customer, toast success, reload the form bound to the new customer.

### Scope (what moves with the contract)

The contract row's `customer_id` is the only authoritative link. All related rows (invoices, site_billing_status, contract_amendments, asset_status_history, notifications, invoice_alerts) reference `contract_id`, so they follow automatically — no extra updates needed.

### Out of scope

- No bulk move
- No Xero contact change (the existing Xero invoices remain under their original Xero contact; future invoices will use the new customer's Xero contact as normal)
- No customer merge

### Permissions

Restricted to users who can already edit contracts (existing `can_write` check via RLS on the contracts table — no policy changes needed).

### Files touched

- `src/components/contracts/ContractForm.tsx` — add the "Move" button + dialog, customer picker, update handler.
- Possibly a new small component `src/components/contracts/MoveContractDialog.tsx` to keep the form tidy.

### Question

Should the move be allowed when the contract has invoices already issued under the old customer? (Default: yes, with a warning that historical invoices stay linked to the contract and will now display under the new customer in the app — Xero records are unaffected.)

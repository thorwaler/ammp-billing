

## Restore Deleted Elum Invoice

The invoice `36939cef-075f-4136-8381-eb0bfe38499b` was deleted from the database via a DELETE request. I can see the full invoice data from the network logs captured just before the deletion.

### What was deleted
- **Customer**: Elum (merged invoice for 7 contracts)
- **Invoice date**: March 31, 2026
- **Amount**: €36,855.77
- **Xero ID**: `bacb1202-3800-4d0e-b62e-72ac25853365`
- **Billing frequency**: quarterly

### Recovery plan

**Database migration**: Re-insert the invoice record with all its original data (id, customer_id, contract_id, xero_invoice_id, support_document_data, amounts, etc.) using the data captured in the network logs.

**Contract dates**: The contracts were also patched to reset `next_invoice_date` back to `2026-03-31` and period dates were updated. These may need to be reverted to their pre-skip state as well -- I'll check the current state and restore if needed.

### Files changed

| File | Change |
|------|--------|
| Database migration | INSERT the deleted invoice record back with all original field values; revert contract date fields if needed |


## Reset SPS prepaid balance

The SPS Q2 invoice was redone, so the prepaid balance needs to be reverted to its post-annual-upfront state (full €100,000 remaining, no quarterly credit drawn yet).

### Change

Update the SPS Investments Seychelles Ltd contract (`460a2fc6-af1b-401f-8b91-aaaccdfc98e3`):

- `ytd_invoiced_amount` → `100000` (annual upfront paid, no quarterly draws applied)
- `annual_billing_anchor_date` → `2026-02-28` (unchanged)
- `last_annual_invoice_date` → `2026-02-28` (unchanged — annual upfront still considered issued)

This restores "Prepaid Balance Before" to €100,000 for the Apr–Jun period so the redone Q2 invoice draws the credit cleanly.

### Confirm before running

Just to be safe: should I also clear `last_annual_invoice_date` (which would cause the system to re-bill the €100k annual upfront again), or keep it as-is so only the quarterly credit pool is reset? Default plan keeps it as-is.

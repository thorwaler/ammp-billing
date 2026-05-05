Roll back UNHCR contract dates so the April invoice can be generated.

## Update
Run UPDATE on `contracts` row `533f9659-00f7-4977-bf30-80be40664973`:
- `next_invoice_date` → `2026-04-30`
- `period_start` → `2026-03-30`
- `period_end` → `2026-04-30`

## Verify
Re-query the contract to confirm new dates, and confirm the 3 reset sites (FO Iriba, GH Iriba, Gore) still have `onboarding_fee_paid=false` so they'll be included in the April per_site invoice.

No code changes.


## Update Elum Dates + Reset UNHCR Sites

Two data operations using the database insert tool:

### 1. Advance Elum contract dates to next quarter

Update all 7 Elum contracts (customer `a47378ad-d2a5-4c91-8426-ce87a188bdc4`):
- `next_invoice_date` → `2026-06-30`
- `period_start` → `2026-03-31`
- `period_end` → `2026-06-29`

### 2. Reset 3 UNHCR sites

For site IDs `d593fb12-5395-4b97-ba48-bdaeb20ef660`, `cd08511b-5c53-4ed2-bb9a-b121673fc1db`, `63322962-d188-4d2b-8e48-904eec39b825`:
- `onboarding_fee_paid` → false
- `onboarding_fee_paid_date` → NULL
- `onboarding_invoice_id` → NULL
- `next_annual_due_date` → NULL
- `last_annual_payment_date` → NULL
- `last_annual_invoice_id` → NULL

### Files changed

| File | Change |
|------|--------|
| Database (contracts) | Update 7 Elum contracts to next quarter dates |
| Database (site_billing_status) | Reset billing flags on 3 UNHCR sites |


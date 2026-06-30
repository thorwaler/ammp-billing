
## Goal
Deduct the March 2026 SPS monitoring draw from the prepaid balance — scaled to 1 month, using the 132 assets shown in the uploaded support doc.

## Calculation
- Assets in PDF: 132 sites, 111.46 MWp
- Pre-discount annual fee: 111.46 × €900 = €100,311.12
- Additive discounts: 10% volume + 5% upfront + 3% commitment = 18%
- Annual discounted fee: €82,255.12
- **March-only (1 month) = €82,255.12 / 12 = €6,854.59**

## Change
One data update on the `contracts` table for SPS Investments Seychelles Ltd:

```sql
UPDATE contracts
SET ytd_invoiced_amount = ytd_invoiced_amount - 6854.59
WHERE id = '460a2fc6-af1b-401f-8b91-aaaccdfc98e3';
-- 79,349.49 → 72,494.90
```

No code changes.

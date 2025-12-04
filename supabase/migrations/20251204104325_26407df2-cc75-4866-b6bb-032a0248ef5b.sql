-- Add EUR equivalent columns for proper currency-agnostic totals
ALTER TABLE invoices ADD COLUMN invoice_amount_eur numeric;
ALTER TABLE invoices ADD COLUMN arr_amount_eur numeric;
ALTER TABLE invoices ADD COLUMN nrr_amount_eur numeric;

-- Backfill existing invoices
-- EUR invoices: 1:1
UPDATE invoices SET 
  invoice_amount_eur = invoice_amount,
  arr_amount_eur = arr_amount,
  nrr_amount_eur = nrr_amount
WHERE currency = 'EUR' OR currency IS NULL;

-- USD invoices: ~0.92 EUR
UPDATE invoices SET 
  invoice_amount_eur = invoice_amount * 0.92,
  arr_amount_eur = arr_amount * 0.92,
  nrr_amount_eur = nrr_amount * 0.92
WHERE currency = 'USD';

-- NGN invoices: ~1/1600 EUR
UPDATE invoices SET 
  invoice_amount_eur = invoice_amount / 1600,
  arr_amount_eur = arr_amount / 1600,
  nrr_amount_eur = nrr_amount / 1600
WHERE currency = 'NGN';
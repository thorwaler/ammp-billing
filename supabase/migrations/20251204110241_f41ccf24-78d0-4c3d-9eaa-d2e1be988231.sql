-- Add columns to track Xero credit amounts
ALTER TABLE public.invoices 
ADD COLUMN xero_amount_credited numeric DEFAULT 0,
ADD COLUMN xero_amount_credited_eur numeric DEFAULT 0;
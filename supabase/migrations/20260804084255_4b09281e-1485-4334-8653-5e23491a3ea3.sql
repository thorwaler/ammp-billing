ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS xero_payment_terms_days integer,
  ADD COLUMN IF NOT EXISTS xero_payment_terms_type text;
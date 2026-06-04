ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS annual_minimum_fee numeric,
  ADD COLUMN IF NOT EXISTS committed_minimum_mw numeric,
  ADD COLUMN IF NOT EXISTS annual_billing_anchor_date timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_annual_invoice_date timestamp with time zone,
  ADD COLUMN IF NOT EXISTS ytd_invoiced_amount numeric NOT NULL DEFAULT 0;
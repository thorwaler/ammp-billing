ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS invoice_freeze_enabled boolean NOT NULL DEFAULT true;
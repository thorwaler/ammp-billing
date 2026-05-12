ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS invoice_lead_days INTEGER NOT NULL DEFAULT 0;

UPDATE public.contracts
SET invoice_lead_days = 45
WHERE invoice_lead_days = 0
  AND package IN ('elum_epm', 'elum_jubaili', 'elum_portfolio_os', 'elum_internal');
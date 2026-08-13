ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS superseded_by_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superseded_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS revision_reason text;

CREATE INDEX IF NOT EXISTS idx_invoices_superseded_by ON public.invoices(superseded_by_invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_revised_from ON public.invoices(revised_from_invoice_id);
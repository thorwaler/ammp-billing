-- Create invoices history table for tracking MW changes and invoice records
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  
  -- Invoice identification
  invoice_date TIMESTAMPTZ NOT NULL,
  xero_invoice_id TEXT,
  billing_frequency TEXT NOT NULL,
  
  -- MW tracking (key data for analytics)
  mw_managed NUMERIC NOT NULL,
  mw_change NUMERIC DEFAULT 0,
  total_mw NUMERIC NOT NULL,
  
  -- Financial data
  invoice_amount NUMERIC NOT NULL,
  currency TEXT DEFAULT 'EUR',
  
  -- Module and addon details (for audit trail)
  modules_data JSONB DEFAULT '[]'::jsonb,
  addons_data JSONB DEFAULT '[]'::jsonb,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own invoices"
  ON public.invoices FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own invoices"
  ON public.invoices FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own invoices"
  ON public.invoices FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own invoices"
  ON public.invoices FOR DELETE
  USING (auth.uid() = user_id);

-- Add index for fast queries by customer and date
CREATE INDEX idx_invoices_customer_date ON public.invoices(customer_id, invoice_date DESC);

-- Add index for date-based analytics queries
CREATE INDEX idx_invoices_date ON public.invoices(invoice_date DESC);

-- Add trigger for updated_at
CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
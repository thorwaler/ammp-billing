-- Add per-site pricing columns to contracts table
ALTER TABLE public.contracts 
ADD COLUMN IF NOT EXISTS onboarding_fee_per_site numeric DEFAULT 1000,
ADD COLUMN IF NOT EXISTS annual_fee_per_site numeric DEFAULT 1000;

-- Create site_billing_status table to track per-site billing
CREATE TABLE IF NOT EXISTS public.site_billing_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL,
  asset_name TEXT NOT NULL,
  asset_capacity_kwp numeric DEFAULT 0,
  onboarding_date TIMESTAMP WITH TIME ZONE,
  
  -- Onboarding fee tracking
  onboarding_fee_paid BOOLEAN DEFAULT false,
  onboarding_fee_paid_date TIMESTAMP WITH TIME ZONE,
  onboarding_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  
  -- Annual subscription tracking
  last_annual_payment_date TIMESTAMP WITH TIME ZONE,
  last_annual_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  next_annual_due_date TIMESTAMP WITH TIME ZONE,
  
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(contract_id, asset_id)
);

-- Enable RLS
ALTER TABLE public.site_billing_status ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own site billing status"
ON public.site_billing_status FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own site billing status"
ON public.site_billing_status FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own site billing status"
ON public.site_billing_status FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own site billing status"
ON public.site_billing_status FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_site_billing_status_updated_at
BEFORE UPDATE ON public.site_billing_status
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
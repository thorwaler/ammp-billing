-- Add ARR/NRR tracking columns to invoices table
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'internal';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS arr_amount NUMERIC DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS nrr_amount NUMERIC DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS xero_reference TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS xero_line_items JSONB DEFAULT '[]';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS xero_status TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS xero_contact_name TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS xero_synced_at TIMESTAMPTZ;

-- Create revenue account mappings table for configurable account code classification
CREATE TABLE IF NOT EXISTS public.revenue_account_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  account_code TEXT NOT NULL,
  account_name TEXT,
  revenue_type TEXT NOT NULL DEFAULT 'non_recurring',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, account_code)
);

-- Enable RLS on revenue_account_mappings
ALTER TABLE public.revenue_account_mappings ENABLE ROW LEVEL SECURITY;

-- RLS policies for revenue_account_mappings
CREATE POLICY "Users can view their own account mappings"
ON public.revenue_account_mappings
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own account mappings"
ON public.revenue_account_mappings
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own account mappings"
ON public.revenue_account_mappings
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own account mappings"
ON public.revenue_account_mappings
FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_revenue_account_mappings_updated_at
BEFORE UPDATE ON public.revenue_account_mappings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
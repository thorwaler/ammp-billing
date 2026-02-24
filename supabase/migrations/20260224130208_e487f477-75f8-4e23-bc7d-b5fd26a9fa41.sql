
-- Create contract_types table
CREATE TABLE public.contract_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  pricing_model text NOT NULL,
  default_currency text DEFAULT 'EUR',
  default_billing_frequency text DEFAULT 'annual',
  force_billing_frequency boolean DEFAULT false,
  default_minimum_annual_value numeric DEFAULT 0,
  modules_config jsonb DEFAULT '[]'::jsonb,
  addons_config jsonb DEFAULT '[]'::jsonb,
  xero_line_items_config jsonb DEFAULT '{}'::jsonb,
  default_values jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add contract_type_id to contracts
ALTER TABLE public.contracts ADD COLUMN contract_type_id uuid REFERENCES public.contract_types(id);

-- Drop the package CHECK constraint to allow custom slugs
ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_package_check;

-- Enable RLS
ALTER TABLE public.contract_types ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view all contract types"
  ON public.contract_types FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers and admins can create contract types"
  ON public.contract_types FOR INSERT
  WITH CHECK (auth.uid() = user_id AND can_write(auth.uid()));

CREATE POLICY "Managers and admins can update contract types"
  ON public.contract_types FOR UPDATE
  USING (auth.uid() = user_id AND can_write(auth.uid()));

CREATE POLICY "Managers and admins can delete contract types"
  ON public.contract_types FOR DELETE
  USING (auth.uid() = user_id AND can_write(auth.uid()));

-- Updated_at trigger
CREATE TRIGGER update_contract_types_updated_at
  BEFORE UPDATE ON public.contract_types
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

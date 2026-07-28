
-- 1. contracts: new columns
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS zero_pv_alert_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS zero_pv_estimate_multiplier numeric NOT NULL DEFAULT 1.2,
  ADD COLUMN IF NOT EXISTS zero_pv_grace_days integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS annual_minimum_mode text NOT NULL DEFAULT 'quarterly_gap',
  ADD COLUMN IF NOT EXISTS first_invoice_date timestamp with time zone,
  ADD COLUMN IF NOT EXISTS inflation_cap_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS anniversary_notice_days integer NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS last_anniversary_notice_sent_at timestamp with time zone;

-- 2. invoices: snapshot + revision fields
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS input_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS snapshot_frozen_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS revision_deadline timestamp with time zone,
  ADD COLUMN IF NOT EXISTS revised_from_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;

-- 3. zero_pv_incidents
CREATE TABLE IF NOT EXISTS public.zero_pv_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  asset_id text NOT NULL,
  asset_name text NOT NULL,
  detected_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone,
  estimated_capacity_mw numeric,
  estimate_source text,
  applied_to_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_zero_pv_incidents_contract ON public.zero_pv_incidents(contract_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_zero_pv_open_per_asset
  ON public.zero_pv_incidents(contract_id, asset_id)
  WHERE resolved_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.zero_pv_incidents TO authenticated;
GRANT ALL ON public.zero_pv_incidents TO service_role;

ALTER TABLE public.zero_pv_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "zero_pv_incidents_select" ON public.zero_pv_incidents
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "zero_pv_incidents_insert" ON public.zero_pv_incidents
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND public.can_write(auth.uid()));
CREATE POLICY "zero_pv_incidents_update" ON public.zero_pv_incidents
  FOR UPDATE TO authenticated USING (auth.uid() = user_id AND public.can_write(auth.uid()))
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "zero_pv_incidents_delete" ON public.zero_pv_incidents
  FOR DELETE TO authenticated USING (auth.uid() = user_id AND public.can_write(auth.uid()));

CREATE TRIGGER update_zero_pv_incidents_updated_at
  BEFORE UPDATE ON public.zero_pv_incidents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. inflation_reference_rates
CREATE TABLE IF NOT EXISTS public.inflation_reference_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month date NOT NULL,
  source text NOT NULL DEFAULT 'ecb_hicp',
  rate_pct numeric NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (month, source)
);

GRANT SELECT ON public.inflation_reference_rates TO authenticated;
GRANT ALL ON public.inflation_reference_rates TO service_role;

ALTER TABLE public.inflation_reference_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inflation_reference_rates_read_all" ON public.inflation_reference_rates
  FOR SELECT TO authenticated USING (true);

CREATE TRIGGER update_inflation_reference_rates_updated_at
  BEFORE UPDATE ON public.inflation_reference_rates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS elum_tier text,
  ADD COLUMN IF NOT EXISTS elum_parent_org_id text,
  ADD COLUMN IF NOT EXISTS org_pricing_config jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS combined_minimum_annual_value numeric,
  ADD COLUMN IF NOT EXISTS combined_minimum_anchor_date timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_combined_minimum_reconciled_at timestamp with time zone;
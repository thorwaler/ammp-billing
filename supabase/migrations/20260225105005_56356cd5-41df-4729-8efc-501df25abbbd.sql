ALTER TABLE public.contract_types
  ADD COLUMN default_upfront_discount_percent numeric DEFAULT NULL,
  ADD COLUMN default_commitment_discount_percent numeric DEFAULT NULL,
  ADD COLUMN asset_group_scoped boolean DEFAULT false;
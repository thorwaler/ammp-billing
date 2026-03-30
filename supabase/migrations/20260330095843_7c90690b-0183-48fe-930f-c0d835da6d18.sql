
ALTER TABLE public.contracts 
  ADD COLUMN IF NOT EXISTS irradiance_per_site_tiers jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS performance_per_mwp_tiers jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS vendor_api_fee numeric,
  ADD COLUMN IF NOT EXISTS onboarding_setup_fee numeric;

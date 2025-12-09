-- Add Elum special contract package columns
-- Asset group support for filtering assets to specific AMMP groups
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS ammp_asset_group_id text;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS ammp_asset_group_name text;

-- Contract-specific AMMP org ID (for Portfolio OS which may use different org)
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS contract_ammp_org_id text;

-- Site-size threshold pricing for ePM package
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS site_size_threshold_kwp numeric DEFAULT 100;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS below_threshold_price_per_kwp numeric DEFAULT 50;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS above_threshold_price_per_kwp numeric DEFAULT 30;

-- Add comments for documentation
COMMENT ON COLUMN public.contracts.ammp_asset_group_id IS 'AMMP asset group ID for filtering assets (used by elum_epm and elum_jubaili packages)';
COMMENT ON COLUMN public.contracts.ammp_asset_group_name IS 'Display name of the AMMP asset group';
COMMENT ON COLUMN public.contracts.contract_ammp_org_id IS 'Contract-specific AMMP org ID (overrides customer org ID for elum_portfolio_os)';
COMMENT ON COLUMN public.contracts.site_size_threshold_kwp IS 'kWp threshold for site-size tiered pricing (elum_epm package)';
COMMENT ON COLUMN public.contracts.below_threshold_price_per_kwp IS 'Price per kWp for sites <= threshold (elum_epm package)';
COMMENT ON COLUMN public.contracts.above_threshold_price_per_kwp IS 'Price per kWp for sites > threshold (elum_epm package)';
-- Drop the existing constraint
ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_package_check;

-- Recreate with the updated allowed list including hybrid_tiered_assetgroups
ALTER TABLE public.contracts ADD CONSTRAINT contracts_package_check 
CHECK (package = ANY (ARRAY['starter','pro','custom','hybrid_tiered','hybrid_tiered_assetgroups','capped','poc','per_site','elum_epm','elum_jubaili','elum_portfolio_os','elum_internal']));
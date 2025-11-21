-- Update the package check constraint to include hybrid_tiered
ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_package_check;

ALTER TABLE public.contracts 
ADD CONSTRAINT contracts_package_check 
CHECK (package IN ('starter', 'pro', 'custom', 'hybrid_tiered'));
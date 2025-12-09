-- Drop the old constraint
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_package_check;

-- Add updated constraint with Elum packages
ALTER TABLE contracts ADD CONSTRAINT contracts_package_check 
CHECK (package = ANY (ARRAY[
  'starter'::text, 
  'pro'::text, 
  'custom'::text, 
  'hybrid_tiered'::text, 
  'capped'::text, 
  'poc'::text, 
  'per_site'::text,
  'elum_epm'::text,
  'elum_jubaili'::text,
  'elum_portfolio_os'::text
]));
-- Drop the existing constraint
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_package_check;

-- Add the updated constraint with 'poc' included
ALTER TABLE contracts ADD CONSTRAINT contracts_package_check 
CHECK (package = ANY (ARRAY['starter'::text, 'pro'::text, 'custom'::text, 'hybrid_tiered'::text, 'capped'::text, 'poc'::text]));
-- Add hybrid_tiered to package options
-- Note: We cannot directly add to an enum in a safe way, so we'll allow any text value
-- The application will enforce the valid package types

-- Add comment to document valid package types
COMMENT ON COLUMN contracts.package IS 'Valid values: starter, pro, custom, hybrid_tiered';

-- Drop the security-problematic view
-- The filtering logic will be moved to application code using proper RLS-protected queries
DROP VIEW IF EXISTS customers_without_contracts;
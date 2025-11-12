-- Drop the problematic SECURITY DEFINER view and recreate without that property
DROP VIEW IF EXISTS customers_without_contracts;

-- Recreate view without SECURITY DEFINER
CREATE VIEW customers_without_contracts AS
SELECT c.* 
FROM customers c
LEFT JOIN contracts ct ON c.id = ct.customer_id
WHERE ct.id IS NULL;
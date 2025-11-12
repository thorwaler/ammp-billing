-- Add view to identify customers without contracts
CREATE OR REPLACE VIEW customers_without_contracts AS
SELECT c.* 
FROM customers c
LEFT JOIN contracts ct ON c.id = ct.customer_id
WHERE ct.id IS NULL;

-- Add location column to customers if it doesn't exist
ALTER TABLE customers ADD COLUMN IF NOT EXISTS location TEXT;
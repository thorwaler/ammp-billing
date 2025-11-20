-- Add manual_status_override field to customers table
ALTER TABLE customers 
ADD COLUMN manual_status_override BOOLEAN DEFAULT FALSE;

-- Add comment explaining the field
COMMENT ON COLUMN customers.manual_status_override IS 'When true, Xero sync will not modify the status field. Allows users to manually control customer status independent of Xero.';

-- Add index for performance when filtering overridden customers
CREATE INDEX idx_customers_manual_override 
ON customers(user_id, manual_status_override) 
WHERE manual_status_override = true;
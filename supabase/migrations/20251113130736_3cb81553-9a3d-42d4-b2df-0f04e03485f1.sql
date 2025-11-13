-- Ensure only one active contract per customer
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_contract_per_customer 
ON contracts(customer_id) 
WHERE contract_status = 'active';

-- Add comment for documentation
COMMENT ON INDEX unique_active_contract_per_customer IS 'Ensures each customer can only have one active contract at a time';
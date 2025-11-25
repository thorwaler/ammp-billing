-- Drop the unique constraint that limits customers to one active contract
DROP INDEX IF EXISTS unique_active_contract_per_customer;
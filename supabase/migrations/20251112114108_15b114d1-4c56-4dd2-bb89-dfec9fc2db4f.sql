-- Add minimum annual value column to contracts
ALTER TABLE contracts 
ADD COLUMN minimum_annual_value NUMERIC DEFAULT 0;

-- Set default currency to EUR instead of USD for existing records
UPDATE contracts SET currency = 'EUR' WHERE currency IS NULL OR currency = 'USD';

-- Update the default for new records
ALTER TABLE contracts 
ALTER COLUMN currency SET DEFAULT 'EUR';

-- Update the check constraint to ensure currency is valid
ALTER TABLE contracts 
DROP CONSTRAINT IF EXISTS contracts_currency_check;

ALTER TABLE contracts 
ADD CONSTRAINT contracts_currency_check CHECK (currency IN ('USD', 'EUR'));
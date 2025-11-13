-- Add new date tracking fields to contracts table
ALTER TABLE contracts 
ADD COLUMN IF NOT EXISTS signed_date timestamp with time zone,
ADD COLUMN IF NOT EXISTS period_start timestamp with time zone,
ADD COLUMN IF NOT EXISTS period_end timestamp with time zone;

-- Add helpful comments
COMMENT ON COLUMN contracts.signed_date IS 'Date when the contract was signed';
COMMENT ON COLUMN contracts.period_start IS 'Start date of current billing period';
COMMENT ON COLUMN contracts.period_end IS 'End date of current billing period';
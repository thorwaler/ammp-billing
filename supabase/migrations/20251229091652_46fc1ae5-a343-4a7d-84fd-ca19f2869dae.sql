-- Add tax_category column to customers table
ALTER TABLE customers 
ADD COLUMN tax_category TEXT DEFAULT 'non_eu' 
CHECK (tax_category IN ('non_eu', 'eu', 'tax_exempt'));

-- Add comment for documentation
COMMENT ON COLUMN customers.tax_category IS 'Tax category for Xero invoicing: non_eu (Zero Rated), eu (Reverse Charge), tax_exempt (UN/Intl Orgs)';
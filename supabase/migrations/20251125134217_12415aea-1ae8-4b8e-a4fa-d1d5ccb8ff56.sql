-- Add base monthly price field to contracts
ALTER TABLE contracts 
ADD COLUMN base_monthly_price numeric DEFAULT 0;
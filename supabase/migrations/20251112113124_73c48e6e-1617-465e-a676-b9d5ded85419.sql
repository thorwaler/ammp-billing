-- Add currency column to contracts table
ALTER TABLE contracts 
ADD COLUMN currency TEXT DEFAULT 'USD' CHECK (currency IN ('USD', 'EUR'));
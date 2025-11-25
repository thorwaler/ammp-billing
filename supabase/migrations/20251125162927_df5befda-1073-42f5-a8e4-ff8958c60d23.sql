-- Add site charge frequency column to contracts table
ALTER TABLE contracts 
ADD COLUMN site_charge_frequency text DEFAULT 'annual'::text;
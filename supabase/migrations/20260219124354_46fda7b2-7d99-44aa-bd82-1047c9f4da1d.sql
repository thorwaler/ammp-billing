
-- Add SolarAfrica API specific columns to contracts table
ALTER TABLE public.contracts ADD COLUMN municipality_count integer NULL;
ALTER TABLE public.contracts ADD COLUMN api_setup_fee numeric NULL;
ALTER TABLE public.contracts ADD COLUMN hourly_rate numeric NULL;

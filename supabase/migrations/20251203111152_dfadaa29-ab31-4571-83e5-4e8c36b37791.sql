-- Add retainer hours fields to contracts table
ALTER TABLE public.contracts ADD COLUMN retainer_hours numeric DEFAULT NULL;
ALTER TABLE public.contracts ADD COLUMN retainer_hourly_rate numeric DEFAULT NULL;
ALTER TABLE public.contracts ADD COLUMN retainer_minimum_value numeric DEFAULT NULL;
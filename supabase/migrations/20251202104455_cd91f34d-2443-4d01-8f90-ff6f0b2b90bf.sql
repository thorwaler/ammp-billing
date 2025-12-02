-- Add contract_expiry_date column for tracking when contracts actually expire
-- This is separate from period_end which is used for billing cycles
ALTER TABLE public.contracts ADD COLUMN contract_expiry_date timestamp with time zone;
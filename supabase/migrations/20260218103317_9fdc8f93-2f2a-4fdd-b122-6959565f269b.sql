
-- Add trial-related columns for AMMP OS 2026 package
ALTER TABLE public.contracts ADD COLUMN is_trial boolean NOT NULL DEFAULT false;
ALTER TABLE public.contracts ADD COLUMN trial_setup_fee numeric;
ALTER TABLE public.contracts ADD COLUMN vendor_api_onboarding_fee numeric;

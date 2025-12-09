-- Rename Elum ePM pricing columns from per-kWp to per-MWp for clarity
-- The actual pricing is per MWp, not per kWp

ALTER TABLE public.contracts 
  RENAME COLUMN below_threshold_price_per_kwp TO below_threshold_price_per_mwp;

ALTER TABLE public.contracts 
  RENAME COLUMN above_threshold_price_per_kwp TO above_threshold_price_per_mwp;
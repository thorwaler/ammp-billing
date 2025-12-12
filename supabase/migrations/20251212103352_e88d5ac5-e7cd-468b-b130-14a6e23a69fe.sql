-- Add graduated_mw_tiers column for Elum Internal Assets package
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS graduated_mw_tiers jsonb DEFAULT '[]'::jsonb;
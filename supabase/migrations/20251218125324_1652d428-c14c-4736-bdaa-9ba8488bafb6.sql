-- Add custom_asset_pricing column to contracts table
-- Structure: { assetId: { pricingType: 'annual'|'per_mw', price: number, note?: string } }
ALTER TABLE public.contracts 
ADD COLUMN IF NOT EXISTS custom_asset_pricing JSONB DEFAULT '{}'::jsonb;
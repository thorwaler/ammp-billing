-- Add AMMP integration columns to customers table
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS ammp_org_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS ammp_asset_ids JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS ammp_capabilities JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS last_ammp_sync TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS ammp_sync_status TEXT DEFAULT 'never_synced';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_customers_ammp_org_id ON customers(ammp_org_id) WHERE ammp_org_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN customers.ammp_org_id IS 'AMMP organization ID for API data fetching';
COMMENT ON COLUMN customers.ammp_asset_ids IS 'Array of AMMP asset IDs: ["uuid1", "uuid2"]';
COMMENT ON COLUMN customers.ammp_capabilities IS 'Cached device capabilities per asset';
COMMENT ON COLUMN customers.last_ammp_sync IS 'Last successful sync timestamp';
COMMENT ON COLUMN customers.ammp_sync_status IS 'Status: never_synced, syncing, success, error';
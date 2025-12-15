-- Add scheduled sync columns to xero_connections
ALTER TABLE xero_connections 
ADD COLUMN IF NOT EXISTS sync_schedule text DEFAULT 'disabled',
ADD COLUMN IF NOT EXISTS last_sync_at timestamptz,
ADD COLUMN IF NOT EXISTS next_sync_at timestamptz;
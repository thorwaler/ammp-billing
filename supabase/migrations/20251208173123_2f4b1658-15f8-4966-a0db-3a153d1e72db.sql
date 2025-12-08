-- Add sync schedule columns to ammp_connections
ALTER TABLE public.ammp_connections
ADD COLUMN IF NOT EXISTS sync_schedule text DEFAULT 'disabled',
ADD COLUMN IF NOT EXISTS last_sync_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS next_sync_at timestamp with time zone;

-- Add comment for sync_schedule options
COMMENT ON COLUMN public.ammp_connections.sync_schedule IS 'Options: disabled, daily, weekly, monthly_first, monthly_last, quarterly_last';
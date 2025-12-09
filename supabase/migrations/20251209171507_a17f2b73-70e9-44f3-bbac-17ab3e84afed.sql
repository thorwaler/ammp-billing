-- Phase 1: Add AMMP columns to contracts table and migrate data from customers

-- Step 1: Add new columns to contracts table (some already exist, only add missing ones)
ALTER TABLE public.contracts 
ADD COLUMN IF NOT EXISTS ammp_asset_ids jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS ammp_sync_status text DEFAULT 'never_synced'::text,
ADD COLUMN IF NOT EXISTS last_ammp_sync timestamp with time zone;

-- Step 2: Rename contract_ammp_org_id to ammp_org_id for consistency
-- First add ammp_org_id if it doesn't exist
ALTER TABLE public.contracts 
ADD COLUMN IF NOT EXISTS ammp_org_id text;

-- Step 3: Migrate data from customers to their contracts
-- For each customer with AMMP data, copy to all their active contracts
UPDATE public.contracts c
SET 
  ammp_org_id = COALESCE(c.ammp_org_id, c.contract_ammp_org_id, cust.ammp_org_id),
  ammp_asset_ids = CASE 
    WHEN c.cached_capabilities IS NOT NULL AND c.cached_capabilities->'assetBreakdown' IS NOT NULL 
    THEN c.cached_capabilities->'assetBreakdown'
    ELSE COALESCE(cust.ammp_asset_ids, '[]'::jsonb)
  END,
  ammp_sync_status = CASE
    WHEN c.cached_capabilities IS NOT NULL THEN 'synced'
    WHEN cust.ammp_sync_status IS NOT NULL THEN cust.ammp_sync_status
    ELSE 'never_synced'
  END,
  last_ammp_sync = CASE
    WHEN c.cached_capabilities IS NOT NULL THEN now()
    ELSE cust.last_ammp_sync
  END,
  cached_capabilities = COALESCE(c.cached_capabilities, cust.ammp_capabilities)
FROM public.customers cust
WHERE c.customer_id = cust.id
  AND c.contract_status = 'active'
  AND c.package != 'poc';

-- Step 4: Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_contracts_ammp_org_id ON public.contracts(ammp_org_id);
CREATE INDEX IF NOT EXISTS idx_contracts_ammp_sync_status ON public.contracts(ammp_sync_status);

-- Note: contract_ammp_org_id column kept for backward compatibility during transition
-- Note: Customer AMMP columns will be deprecated but not removed yet for safety
-- Add cached_capabilities column to contracts table for Elum contract-level sync
ALTER TABLE public.contracts ADD COLUMN cached_capabilities JSONB DEFAULT NULL;

-- Add comment explaining the structure
COMMENT ON COLUMN public.contracts.cached_capabilities IS 'Contract-level AMMP capabilities for Elum packages. Structure: { totalMW, totalSites, ongridMW, hybridMW, ongridSites, hybridSites, sitesWithSolcast, assetBreakdown, lastSynced }';
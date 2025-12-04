-- Backfill mwp_managed values from ammp_capabilities.assetBreakdown
-- This fixes customers who synced before the mwp_managed update logic was added

UPDATE customers
SET mwp_managed = (
  SELECT COALESCE(SUM((asset->>'totalMW')::numeric), 0)
  FROM jsonb_array_elements(ammp_capabilities->'assetBreakdown') as asset
)
WHERE ammp_capabilities IS NOT NULL 
  AND ammp_capabilities::text != 'null'
  AND jsonb_typeof(ammp_capabilities->'assetBreakdown') = 'array';
-- Migrate AMMP Org IDs from customers to contracts where missing
UPDATE contracts c
SET ammp_org_id = cu.ammp_org_id
FROM customers cu
WHERE c.customer_id = cu.id
  AND c.ammp_org_id IS NULL
  AND cu.ammp_org_id IS NOT NULL;
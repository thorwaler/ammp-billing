
-- Step 1: Delete duplicate invoices, keeping the most recent version for each xero_invoice_id
DELETE FROM invoices
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER(
        PARTITION BY xero_invoice_id 
        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
      ) as rn
    FROM invoices
    WHERE xero_invoice_id IS NOT NULL
  ) t
  WHERE t.rn > 1
);

-- Step 2: Add unique partial index to prevent future duplicates
CREATE UNIQUE INDEX invoices_xero_invoice_id_unique 
ON invoices(xero_invoice_id) 
WHERE xero_invoice_id IS NOT NULL;

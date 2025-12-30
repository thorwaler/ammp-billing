-- Add new invoicing_type column
ALTER TABLE contracts ADD COLUMN invoicing_type text DEFAULT 'standard';

-- Migrate existing data from manual_invoicing
UPDATE contracts SET invoicing_type = 'manual' WHERE manual_invoicing = true;
UPDATE contracts SET invoicing_type = 'standard' WHERE manual_invoicing = false OR manual_invoicing IS NULL;

-- Drop the old manual_invoicing column
ALTER TABLE contracts DROP COLUMN manual_invoicing;
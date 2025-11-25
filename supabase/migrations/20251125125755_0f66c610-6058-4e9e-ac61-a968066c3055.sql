-- Add manual_invoicing column to contracts table
ALTER TABLE contracts 
ADD COLUMN manual_invoicing boolean DEFAULT false;

COMMENT ON COLUMN contracts.manual_invoicing IS 'If true, invoices for this contract are handled manually or automated directly in Xero and will not be sent to Xero from this app';
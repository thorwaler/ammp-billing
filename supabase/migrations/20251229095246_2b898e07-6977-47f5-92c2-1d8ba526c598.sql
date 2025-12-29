-- Add xero_tax_type column to customers table to store Xero's AccountsReceivableTaxType
ALTER TABLE public.customers 
ADD COLUMN xero_tax_type text DEFAULT NULL;

COMMENT ON COLUMN public.customers.xero_tax_type IS 'The AccountsReceivableTaxType from Xero Contact, used when sending invoices';
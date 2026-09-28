DROP INDEX IF EXISTS invoices_xero_invoice_id_unique;

CREATE UNIQUE INDEX invoices_xero_invoice_id_unique
ON public.invoices(xero_invoice_id)
WHERE xero_invoice_id IS NOT NULL AND superseded_at IS NULL;
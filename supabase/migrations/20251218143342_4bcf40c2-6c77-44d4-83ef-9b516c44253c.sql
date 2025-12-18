-- Add merged_contract_ids column to track which contracts were merged into a single invoice
ALTER TABLE public.invoices ADD COLUMN merged_contract_ids jsonb DEFAULT NULL;
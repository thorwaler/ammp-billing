-- Add support_document_data column to invoices table to store SupportDocumentData JSON
ALTER TABLE invoices ADD COLUMN support_document_data JSONB;
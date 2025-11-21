-- Make pdf_url nullable in contract_amendments table since PDFs are now optional
ALTER TABLE contract_amendments 
ALTER COLUMN pdf_url DROP NOT NULL;
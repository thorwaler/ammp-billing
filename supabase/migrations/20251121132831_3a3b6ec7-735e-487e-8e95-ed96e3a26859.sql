-- Add PDF storage columns to contracts table
ALTER TABLE contracts 
ADD COLUMN contract_pdf_url text,
ADD COLUMN ocr_data jsonb DEFAULT '{}'::jsonb,
ADD COLUMN ocr_status text DEFAULT 'pending',
ADD COLUMN ocr_processed_at timestamptz;

-- Create storage bucket for contract PDFs
INSERT INTO storage.buckets (id, name, public) 
VALUES ('contract-pdfs', 'contract-pdfs', false);

-- RLS policy for contract PDFs - users can upload their own files
CREATE POLICY "Users can upload their own contract PDFs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'contract-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

-- RLS policy for contract PDFs - users can read their own files
CREATE POLICY "Users can read their own contract PDFs"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'contract-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

-- RLS policy for contract PDFs - users can delete their own files
CREATE POLICY "Users can delete their own contract PDFs"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'contract-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);
ALTER TABLE public.invoices 
  ADD COLUMN IF NOT EXISTS sharepoint_file_id text,
  ADD COLUMN IF NOT EXISTS sharepoint_drive_id text,
  ADD COLUMN IF NOT EXISTS sharepoint_files jsonb;
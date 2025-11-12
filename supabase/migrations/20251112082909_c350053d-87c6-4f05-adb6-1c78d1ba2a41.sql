-- Add unique constraint on user_id to allow upsert operations
-- Each user should only have one Xero connection at a time
ALTER TABLE public.xero_connections
ADD CONSTRAINT xero_connections_user_id_key UNIQUE (user_id);
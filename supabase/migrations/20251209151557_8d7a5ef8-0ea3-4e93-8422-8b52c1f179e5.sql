-- Add is_whitelabel_partner column to customers table
ALTER TABLE public.customers 
ADD COLUMN is_whitelabel_partner boolean DEFAULT false;
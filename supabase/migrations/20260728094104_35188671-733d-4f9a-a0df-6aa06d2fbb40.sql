ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS xero_branding_theme_id text,
  ADD COLUMN IF NOT EXISTS wht_gross_up_rate numeric;

COMMENT ON COLUMN public.customers.xero_branding_theme_id IS 'Xero BrandingThemeID applied to invoices for this customer (null = org default).';
COMMENT ON COLUMN public.customers.wht_gross_up_rate IS 'Withholding tax rate as decimal (e.g. 0.10 = 10%). Invoice line amounts are divided by (1 - rate) at Xero send time. Null/0 = no gross-up.';
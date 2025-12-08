-- Create helper function to check if user has manager or admin role (can write)
CREATE OR REPLACE FUNCTION public.can_write(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'manager')
  )
$$;

-- Update RLS policies for contracts table
DROP POLICY IF EXISTS "Users can create their own contracts" ON public.contracts;
DROP POLICY IF EXISTS "Users can update their own contracts" ON public.contracts;
DROP POLICY IF EXISTS "Users can delete their own contracts" ON public.contracts;

CREATE POLICY "Managers and admins can create contracts" 
ON public.contracts 
FOR INSERT 
WITH CHECK (auth.uid() = user_id AND public.can_write(auth.uid()));

CREATE POLICY "Managers and admins can update their contracts" 
ON public.contracts 
FOR UPDATE 
USING (auth.uid() = user_id AND public.can_write(auth.uid()));

CREATE POLICY "Managers and admins can delete their contracts" 
ON public.contracts 
FOR DELETE 
USING (auth.uid() = user_id AND public.can_write(auth.uid()));

-- Update RLS policies for customers table
DROP POLICY IF EXISTS "Users can create their own customers" ON public.customers;
DROP POLICY IF EXISTS "Users can update their own customers" ON public.customers;
DROP POLICY IF EXISTS "Users can delete their own customers" ON public.customers;

CREATE POLICY "Managers and admins can create customers" 
ON public.customers 
FOR INSERT 
WITH CHECK (auth.uid() = user_id AND public.can_write(auth.uid()));

CREATE POLICY "Managers and admins can update their customers" 
ON public.customers 
FOR UPDATE 
USING (auth.uid() = user_id AND public.can_write(auth.uid()));

CREATE POLICY "Managers and admins can delete their customers" 
ON public.customers 
FOR DELETE 
USING (auth.uid() = user_id AND public.can_write(auth.uid()));

-- Update RLS policies for invoices table
DROP POLICY IF EXISTS "Users can create their own invoices" ON public.invoices;
DROP POLICY IF EXISTS "Users can update their own invoices" ON public.invoices;
DROP POLICY IF EXISTS "Users can delete their own invoices" ON public.invoices;

CREATE POLICY "Managers and admins can create invoices" 
ON public.invoices 
FOR INSERT 
WITH CHECK (auth.uid() = user_id AND public.can_write(auth.uid()));

CREATE POLICY "Managers and admins can update their invoices" 
ON public.invoices 
FOR UPDATE 
USING (auth.uid() = user_id AND public.can_write(auth.uid()));

CREATE POLICY "Managers and admins can delete their invoices" 
ON public.invoices 
FOR DELETE 
USING (auth.uid() = user_id AND public.can_write(auth.uid()));

-- Update RLS policies for notifications table
DROP POLICY IF EXISTS "Users can insert their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;

CREATE POLICY "Managers and admins can create notifications" 
ON public.notifications 
FOR INSERT 
WITH CHECK (auth.uid() = user_id AND public.can_write(auth.uid()));

CREATE POLICY "Managers and admins can update notifications" 
ON public.notifications 
FOR UPDATE 
USING (auth.uid() = user_id AND public.can_write(auth.uid()));

CREATE POLICY "Managers and admins can delete notifications" 
ON public.notifications 
FOR DELETE 
USING (auth.uid() = user_id AND public.can_write(auth.uid()));

-- Update RLS policies for contract_amendments table
DROP POLICY IF EXISTS "Users can insert their own contract amendments" ON public.contract_amendments;
DROP POLICY IF EXISTS "Users can update their own contract amendments" ON public.contract_amendments;
DROP POLICY IF EXISTS "Users can delete their own contract amendments" ON public.contract_amendments;

CREATE POLICY "Managers and admins can create amendments" 
ON public.contract_amendments 
FOR INSERT 
WITH CHECK (auth.uid() = user_id AND public.can_write(auth.uid()));

CREATE POLICY "Managers and admins can update amendments" 
ON public.contract_amendments 
FOR UPDATE 
USING (auth.uid() = user_id AND public.can_write(auth.uid()));

CREATE POLICY "Managers and admins can delete amendments" 
ON public.contract_amendments 
FOR DELETE 
USING (auth.uid() = user_id AND public.can_write(auth.uid()));

-- Update RLS policies for site_billing_status table
DROP POLICY IF EXISTS "Users can insert their own site billing status" ON public.site_billing_status;
DROP POLICY IF EXISTS "Users can update their own site billing status" ON public.site_billing_status;
DROP POLICY IF EXISTS "Users can delete their own site billing status" ON public.site_billing_status;

CREATE POLICY "Managers and admins can create site billing" 
ON public.site_billing_status 
FOR INSERT 
WITH CHECK (auth.uid() = user_id AND public.can_write(auth.uid()));

CREATE POLICY "Managers and admins can update site billing" 
ON public.site_billing_status 
FOR UPDATE 
USING (auth.uid() = user_id AND public.can_write(auth.uid()));

CREATE POLICY "Managers and admins can delete site billing" 
ON public.site_billing_status 
FOR DELETE 
USING (auth.uid() = user_id AND public.can_write(auth.uid()));

-- Update RLS policies for xero_connections table
DROP POLICY IF EXISTS "Users can insert their own xero connections" ON public.xero_connections;
DROP POLICY IF EXISTS "Users can update their own xero connections" ON public.xero_connections;
DROP POLICY IF EXISTS "Users can delete their own xero connections" ON public.xero_connections;

CREATE POLICY "Managers and admins can create xero connections" 
ON public.xero_connections 
FOR INSERT 
WITH CHECK (auth.uid() = user_id AND public.can_write(auth.uid()));

CREATE POLICY "Managers and admins can update xero connections" 
ON public.xero_connections 
FOR UPDATE 
USING (auth.uid() = user_id AND public.can_write(auth.uid()));

CREATE POLICY "Managers and admins can delete xero connections" 
ON public.xero_connections 
FOR DELETE 
USING (auth.uid() = user_id AND public.can_write(auth.uid()));

-- Update RLS policies for ammp_connections table
DROP POLICY IF EXISTS "Users can create their own AMMP connection" ON public.ammp_connections;
DROP POLICY IF EXISTS "Users can update their own AMMP connection" ON public.ammp_connections;
DROP POLICY IF EXISTS "Users can delete their own AMMP connection" ON public.ammp_connections;

CREATE POLICY "Managers and admins can create AMMP connection" 
ON public.ammp_connections 
FOR INSERT 
WITH CHECK (auth.uid() = user_id AND public.can_write(auth.uid()));

CREATE POLICY "Managers and admins can update AMMP connection" 
ON public.ammp_connections 
FOR UPDATE 
USING (auth.uid() = user_id AND public.can_write(auth.uid()));

CREATE POLICY "Managers and admins can delete AMMP connection" 
ON public.ammp_connections 
FOR DELETE 
USING (auth.uid() = user_id AND public.can_write(auth.uid()));

-- Update RLS policies for revenue_account_mappings table
DROP POLICY IF EXISTS "Users can create their own account mappings" ON public.revenue_account_mappings;
DROP POLICY IF EXISTS "Users can update their own account mappings" ON public.revenue_account_mappings;
DROP POLICY IF EXISTS "Users can delete their own account mappings" ON public.revenue_account_mappings;

CREATE POLICY "Managers and admins can create account mappings" 
ON public.revenue_account_mappings 
FOR INSERT 
WITH CHECK (auth.uid() = user_id AND public.can_write(auth.uid()));

CREATE POLICY "Managers and admins can update account mappings" 
ON public.revenue_account_mappings 
FOR UPDATE 
USING (auth.uid() = user_id AND public.can_write(auth.uid()));

CREATE POLICY "Managers and admins can delete account mappings" 
ON public.revenue_account_mappings 
FOR DELETE 
USING (auth.uid() = user_id AND public.can_write(auth.uid()));

-- Update currency_settings policies (users already can only view/update their own)
DROP POLICY IF EXISTS "Users can update their own currency settings" ON public.currency_settings;

CREATE POLICY "Managers and admins can update currency settings" 
ON public.currency_settings 
FOR UPDATE 
USING (auth.uid() = user_id AND public.can_write(auth.uid()));
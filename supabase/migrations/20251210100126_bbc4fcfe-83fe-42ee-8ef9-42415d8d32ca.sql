
-- Update RLS SELECT policies for team-based data access
-- All authenticated users can view all data; write access remains restricted to admins/managers

-- customers table
DROP POLICY IF EXISTS "Users can view their own customers" ON customers;
CREATE POLICY "Authenticated users can view all customers" 
  ON customers FOR SELECT 
  USING (auth.uid() IS NOT NULL);

-- contracts table
DROP POLICY IF EXISTS "Users can view their own contracts" ON contracts;
CREATE POLICY "Authenticated users can view all contracts" 
  ON contracts FOR SELECT 
  USING (auth.uid() IS NOT NULL);

-- invoices table
DROP POLICY IF EXISTS "Users can view their own invoices" ON invoices;
CREATE POLICY "Authenticated users can view all invoices" 
  ON invoices FOR SELECT 
  USING (auth.uid() IS NOT NULL);

-- notifications table
DROP POLICY IF EXISTS "Users can view their own notifications" ON notifications;
CREATE POLICY "Authenticated users can view all notifications" 
  ON notifications FOR SELECT 
  USING (auth.uid() IS NOT NULL);

-- ammp_connections table
DROP POLICY IF EXISTS "Users can view their own AMMP connection" ON ammp_connections;
CREATE POLICY "Authenticated users can view all AMMP connections" 
  ON ammp_connections FOR SELECT 
  USING (auth.uid() IS NOT NULL);

-- ammp_sync_history table
DROP POLICY IF EXISTS "Users can view their own sync history" ON ammp_sync_history;
CREATE POLICY "Authenticated users can view all sync history" 
  ON ammp_sync_history FOR SELECT 
  USING (auth.uid() IS NOT NULL);

-- ammp_sync_jobs table
DROP POLICY IF EXISTS "Users can view their own sync jobs" ON ammp_sync_jobs;
CREATE POLICY "Authenticated users can view all sync jobs" 
  ON ammp_sync_jobs FOR SELECT 
  USING (auth.uid() IS NOT NULL);

-- contract_amendments table
DROP POLICY IF EXISTS "Users can view their own contract amendments" ON contract_amendments;
CREATE POLICY "Authenticated users can view all contract amendments" 
  ON contract_amendments FOR SELECT 
  USING (auth.uid() IS NOT NULL);

-- site_billing_status table
DROP POLICY IF EXISTS "Users can view their own site billing status" ON site_billing_status;
CREATE POLICY "Authenticated users can view all site billing status" 
  ON site_billing_status FOR SELECT 
  USING (auth.uid() IS NOT NULL);

-- currency_settings table
DROP POLICY IF EXISTS "Users can view their own currency settings" ON currency_settings;
CREATE POLICY "Authenticated users can view all currency settings" 
  ON currency_settings FOR SELECT 
  USING (auth.uid() IS NOT NULL);

-- notification_settings table
DROP POLICY IF EXISTS "Users can view their own notification settings" ON notification_settings;
CREATE POLICY "Authenticated users can view all notification settings" 
  ON notification_settings FOR SELECT 
  USING (auth.uid() IS NOT NULL);

-- xero_connections table
DROP POLICY IF EXISTS "Users can view their own xero connections" ON xero_connections;
CREATE POLICY "Authenticated users can view all xero connections" 
  ON xero_connections FOR SELECT 
  USING (auth.uid() IS NOT NULL);

-- revenue_account_mappings table
DROP POLICY IF EXISTS "Users can view their own account mappings" ON revenue_account_mappings;
CREATE POLICY "Authenticated users can view all account mappings" 
  ON revenue_account_mappings FOR SELECT 
  USING (auth.uid() IS NOT NULL);

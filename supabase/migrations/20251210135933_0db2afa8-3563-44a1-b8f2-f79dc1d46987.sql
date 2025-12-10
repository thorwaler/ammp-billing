-- Make Xero and AMMP integrations shared across all users (team-wide)

-- Drop existing user-specific policies for xero_connections
DROP POLICY IF EXISTS "Managers and admins can create xero connections" ON xero_connections;
DROP POLICY IF EXISTS "Managers and admins can update xero connections" ON xero_connections;
DROP POLICY IF EXISTS "Managers and admins can delete xero connections" ON xero_connections;

-- Create new team-wide policies for xero_connections
-- Any admin/manager can create (still stores user_id for audit)
CREATE POLICY "Managers and admins can create xero connections"
ON xero_connections FOR INSERT
WITH CHECK (can_write(auth.uid()));

-- Any admin/manager can update any connection
CREATE POLICY "Managers and admins can update any xero connection"
ON xero_connections FOR UPDATE
USING (can_write(auth.uid()));

-- Any admin/manager can delete any connection
CREATE POLICY "Managers and admins can delete any xero connection"
ON xero_connections FOR DELETE
USING (can_write(auth.uid()));

-- Drop existing user-specific policies for ammp_connections
DROP POLICY IF EXISTS "Managers and admins can create AMMP connection" ON ammp_connections;
DROP POLICY IF EXISTS "Managers and admins can update AMMP connection" ON ammp_connections;
DROP POLICY IF EXISTS "Managers and admins can delete AMMP connection" ON ammp_connections;

-- Create new team-wide policies for ammp_connections
CREATE POLICY "Managers and admins can create AMMP connection"
ON ammp_connections FOR INSERT
WITH CHECK (can_write(auth.uid()));

CREATE POLICY "Managers and admins can update any AMMP connection"
ON ammp_connections FOR UPDATE
USING (can_write(auth.uid()));

CREATE POLICY "Managers and admins can delete any AMMP connection"
ON ammp_connections FOR DELETE
USING (can_write(auth.uid()));
-- Drop existing user-specific policies for notification_settings
DROP POLICY IF EXISTS "Managers and admins can create notification settings" ON notification_settings;
DROP POLICY IF EXISTS "Managers and admins can update notification settings" ON notification_settings;
DROP POLICY IF EXISTS "Managers and admins can delete notification settings" ON notification_settings;

-- Create new team-wide policies (any manager/admin can manage shared settings)
CREATE POLICY "Managers and admins can create notification settings"
ON notification_settings FOR INSERT
WITH CHECK (can_write(auth.uid()));

CREATE POLICY "Managers and admins can update any notification settings"
ON notification_settings FOR UPDATE
USING (can_write(auth.uid()));

CREATE POLICY "Managers and admins can delete any notification settings"
ON notification_settings FOR DELETE
USING (can_write(auth.uid()));
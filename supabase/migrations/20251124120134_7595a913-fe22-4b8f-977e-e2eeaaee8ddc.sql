-- Add max_mw field to contracts table for capped packages
ALTER TABLE contracts ADD COLUMN max_mw numeric;

-- Create notifications table
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  contract_id uuid REFERENCES contracts,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  severity text DEFAULT 'info',
  is_read boolean DEFAULT false,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
CREATE POLICY "Users can view their own notifications"
ON notifications FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own notifications
CREATE POLICY "Users can insert their own notifications"
ON notifications FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own notifications
CREATE POLICY "Users can update their own notifications"
ON notifications FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own notifications
CREATE POLICY "Users can delete their own notifications"
ON notifications FOR DELETE
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_notifications_updated_at
BEFORE UPDATE ON notifications
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
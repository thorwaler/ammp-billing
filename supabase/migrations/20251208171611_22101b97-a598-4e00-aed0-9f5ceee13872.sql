-- Create notification_settings table for webhook configuration
CREATE TABLE public.notification_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  zapier_webhook_url TEXT,
  webhook_enabled BOOLEAN DEFAULT false,
  notification_types TEXT[] DEFAULT ARRAY['contract_expired', 'contract_expiring_soon', 'mw_warning', 'mw_exceeded']::TEXT[],
  min_severity TEXT DEFAULT 'info',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own notification settings"
ON public.notification_settings
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Managers and admins can create notification settings"
ON public.notification_settings
FOR INSERT
WITH CHECK (auth.uid() = user_id AND can_write(auth.uid()));

CREATE POLICY "Managers and admins can update notification settings"
ON public.notification_settings
FOR UPDATE
USING (auth.uid() = user_id AND can_write(auth.uid()));

CREATE POLICY "Managers and admins can delete notification settings"
ON public.notification_settings
FOR DELETE
USING (auth.uid() = user_id AND can_write(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_notification_settings_updated_at
BEFORE UPDATE ON public.notification_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable pg_net extension for async HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Function to call webhook edge function
CREATE OR REPLACE FUNCTION public.notify_webhook()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  project_url TEXT := 'https://bxogdlfdgudllafzhusn.supabase.co';
  service_role_key TEXT;
BEGIN
  -- Get the service role key from vault (or use anon key for edge function)
  -- Call the edge function asynchronously
  PERFORM extensions.http_post(
    url := project_url || '/functions/v1/push-notification-webhook',
    body := jsonb_build_object(
      'notification_id', NEW.id,
      'user_id', NEW.user_id,
      'type', NEW.type,
      'title', NEW.title,
      'message', NEW.message,
      'severity', NEW.severity,
      'metadata', NEW.metadata,
      'contract_id', NEW.contract_id,
      'created_at', NEW.created_at
    )::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4b2dkbGZkZ3VkbGxhZnpodXNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI4Nzc2NTEsImV4cCI6MjA3ODQ1MzY1MX0.BKIiYQ2mSBMv3Jry29WU4zhxiNPTwUmMtza7XIsYNvk'
    )
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger on notifications table
CREATE TRIGGER push_notification_to_webhook
AFTER INSERT ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.notify_webhook();
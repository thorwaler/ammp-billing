CREATE TABLE public.slack_notification_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  channel_name TEXT,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (notification_type)
);

GRANT SELECT ON public.slack_notification_routes TO authenticated;
GRANT ALL ON public.slack_notification_routes TO service_role;

ALTER TABLE public.slack_notification_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view Slack routes"
ON public.slack_notification_routes
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers and admins can create Slack routes"
ON public.slack_notification_routes
FOR INSERT
WITH CHECK (can_write(auth.uid()));

CREATE POLICY "Managers and admins can update Slack routes"
ON public.slack_notification_routes
FOR UPDATE
USING (can_write(auth.uid()));

CREATE POLICY "Managers and admins can delete Slack routes"
ON public.slack_notification_routes
FOR DELETE
USING (can_write(auth.uid()));

CREATE TRIGGER update_slack_notification_routes_updated_at
BEFORE UPDATE ON public.slack_notification_routes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.notify_slack_for_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  project_url TEXT := 'https://bxogdlfdgudllafzhusn.supabase.co';
BEGIN
  PERFORM net.http_post(
    url := project_url || '/functions/v1/slack-post-alert',
    body := jsonb_build_object(
      'alert_id', NEW.id,
      'user_id', NEW.user_id,
      'alert_type', NEW.alert_type,
      'severity', NEW.severity,
      'title', NEW.title,
      'description', NEW.description,
      'metadata', NEW.metadata,
      'contract_id', NEW.contract_id,
      'customer_id', NEW.customer_id,
      'invoice_id', NEW.invoice_id,
      'created_at', NEW.created_at
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4b2dkbGZkZ3VkbGxhZnpodXNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI4Nzc2NTEsImV4cCI6MjA3ODQ1MzY1MX0.BKIiYQ2mSBMv3Jry29WU4zhxiNPTwUmMtza7XIsYNvk'
    )
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER push_invoice_alert_to_slack
AFTER INSERT ON public.invoice_alerts
FOR EACH ROW
EXECUTE FUNCTION public.notify_slack_for_alert();
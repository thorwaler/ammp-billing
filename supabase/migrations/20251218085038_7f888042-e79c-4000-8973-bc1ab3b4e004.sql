CREATE OR REPLACE FUNCTION public.notify_webhook()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  project_url TEXT := 'https://bxogdlfdgudllafzhusn.supabase.co';
BEGIN
  -- Use pg_net extension instead of http extension
  PERFORM net.http_post(
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
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4b2dkbGZkZ3VkbGxhZnpodXNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI4Nzc2NTEsImV4cCI6MjA3ODQ1MzY1MX0.BKIiYQ2mSBMv3Jry29WU4zhxiNPTwUmMtza7XIsYNvk'
    )
  );
  
  RETURN NEW;
END;
$function$;
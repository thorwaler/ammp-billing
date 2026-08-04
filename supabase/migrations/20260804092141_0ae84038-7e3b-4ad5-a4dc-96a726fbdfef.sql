ALTER TABLE public.slack_notification_routes
  DROP CONSTRAINT IF EXISTS slack_notification_routes_notification_type_key;

ALTER TABLE public.slack_notification_routes
  ADD CONSTRAINT slack_notification_routes_type_channel_key
  UNIQUE (notification_type, channel_id);
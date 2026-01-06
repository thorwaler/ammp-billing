-- Create asset_status_history table to track individual asset status changes
CREATE TABLE public.asset_status_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  asset_id TEXT NOT NULL,
  asset_name TEXT NOT NULL,
  capacity_mw NUMERIC NOT NULL DEFAULT 0,
  status_change TEXT NOT NULL, -- 'appeared', 'disappeared', 'reappeared'
  detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  previous_seen_at TIMESTAMP WITH TIME ZONE,
  days_absent INTEGER,
  sync_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.asset_status_history ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view all asset status history"
ON public.asset_status_history
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers and admins can create asset status history"
ON public.asset_status_history
FOR INSERT
WITH CHECK ((auth.uid() = user_id) AND can_write(auth.uid()));

-- Create index for efficient querying
CREATE INDEX idx_asset_status_history_contract_id ON public.asset_status_history(contract_id);
CREATE INDEX idx_asset_status_history_asset_id ON public.asset_status_history(asset_id);
CREATE INDEX idx_asset_status_history_detected_at ON public.asset_status_history(detected_at DESC);

-- Add new columns to alert_settings for asset tracking configuration
ALTER TABLE public.alert_settings
ADD COLUMN individual_asset_tracking_enabled BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN asset_reappear_suspicious_days INTEGER NOT NULL DEFAULT 30,
ADD COLUMN minimum_asset_mw_for_alert NUMERIC NOT NULL DEFAULT 0.01;
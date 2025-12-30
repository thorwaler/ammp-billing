-- Create sharepoint_connections table
CREATE TABLE public.sharepoint_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  tenant_id TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_sync_at TIMESTAMP WITH TIME ZONE,
  account_name TEXT
);

-- Enable RLS on sharepoint_connections
ALTER TABLE public.sharepoint_connections ENABLE ROW LEVEL SECURITY;

-- RLS policies for sharepoint_connections
CREATE POLICY "Authenticated users can view all sharepoint connections"
  ON public.sharepoint_connections
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers and admins can create sharepoint connections"
  ON public.sharepoint_connections
  FOR INSERT
  WITH CHECK (can_write(auth.uid()));

CREATE POLICY "Managers and admins can update any sharepoint connection"
  ON public.sharepoint_connections
  FOR UPDATE
  USING (can_write(auth.uid()));

CREATE POLICY "Managers and admins can delete any sharepoint connection"
  ON public.sharepoint_connections
  FOR DELETE
  USING (can_write(auth.uid()));

-- Create sharepoint_folder_settings table
CREATE TABLE public.sharepoint_folder_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id UUID NOT NULL REFERENCES public.sharepoint_connections(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  document_type TEXT NOT NULL DEFAULT 'support_document',
  site_id TEXT NOT NULL,
  site_name TEXT,
  drive_id TEXT NOT NULL,
  drive_name TEXT,
  folder_id TEXT,
  folder_path TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(connection_id, document_type)
);

-- Enable RLS on sharepoint_folder_settings
ALTER TABLE public.sharepoint_folder_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for sharepoint_folder_settings
CREATE POLICY "Authenticated users can view all sharepoint folder settings"
  ON public.sharepoint_folder_settings
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers and admins can create sharepoint folder settings"
  ON public.sharepoint_folder_settings
  FOR INSERT
  WITH CHECK (can_write(auth.uid()));

CREATE POLICY "Managers and admins can update any sharepoint folder settings"
  ON public.sharepoint_folder_settings
  FOR UPDATE
  USING (can_write(auth.uid()));

CREATE POLICY "Managers and admins can delete any sharepoint folder settings"
  ON public.sharepoint_folder_settings
  FOR DELETE
  USING (can_write(auth.uid()));

-- Add updated_at trigger for sharepoint_connections
CREATE TRIGGER update_sharepoint_connections_updated_at
  BEFORE UPDATE ON public.sharepoint_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add updated_at trigger for sharepoint_folder_settings
CREATE TRIGGER update_sharepoint_folder_settings_updated_at
  BEFORE UPDATE ON public.sharepoint_folder_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
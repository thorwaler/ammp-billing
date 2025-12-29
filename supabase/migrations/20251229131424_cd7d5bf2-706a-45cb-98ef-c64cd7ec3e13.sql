-- Create alert_settings table
CREATE TABLE public.alert_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  invoice_increase_warning numeric NOT NULL DEFAULT 0.30,
  invoice_increase_critical numeric NOT NULL DEFAULT 0.50,
  invoice_increase_enabled boolean NOT NULL DEFAULT true,
  mw_decrease_enabled boolean NOT NULL DEFAULT true,
  mw_decrease_threshold numeric NOT NULL DEFAULT 0,
  site_decrease_enabled boolean NOT NULL DEFAULT true,
  site_decrease_threshold integer NOT NULL DEFAULT 0,
  asset_manipulation_enabled boolean NOT NULL DEFAULT true,
  asset_manipulation_window_days integer NOT NULL DEFAULT 30,
  asset_manipulation_threshold numeric NOT NULL DEFAULT 0.05,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.alert_settings ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can view all alert settings" 
ON public.alert_settings 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers and admins can create alert settings" 
ON public.alert_settings 
FOR INSERT 
WITH CHECK ((auth.uid() = user_id) AND can_write(auth.uid()));

CREATE POLICY "Managers and admins can update alert settings" 
ON public.alert_settings 
FOR UPDATE 
USING ((auth.uid() = user_id) AND can_write(auth.uid()));

CREATE POLICY "Managers and admins can delete alert settings" 
ON public.alert_settings 
FOR DELETE 
USING ((auth.uid() = user_id) AND can_write(auth.uid()));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_alert_settings_updated_at
BEFORE UPDATE ON public.alert_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
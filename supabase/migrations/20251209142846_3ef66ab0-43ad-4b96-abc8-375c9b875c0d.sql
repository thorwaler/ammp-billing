-- Create ammp_sync_jobs table for background sync tracking
CREATE TABLE public.ammp_sync_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  total_assets INTEGER DEFAULT 0,
  processed_assets INTEGER DEFAULT 0,
  current_asset_name TEXT,
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.ammp_sync_jobs ENABLE ROW LEVEL SECURITY;

-- Users can view their own sync jobs
CREATE POLICY "Users can view their own sync jobs" 
ON public.ammp_sync_jobs 
FOR SELECT 
USING (auth.uid() = user_id);

-- Managers and admins can create sync jobs
CREATE POLICY "Managers and admins can create sync jobs" 
ON public.ammp_sync_jobs 
FOR INSERT 
WITH CHECK (auth.uid() = user_id AND can_write(auth.uid()));

-- Managers and admins can update sync jobs
CREATE POLICY "Managers and admins can update sync jobs" 
ON public.ammp_sync_jobs 
FOR UPDATE 
USING (auth.uid() = user_id AND can_write(auth.uid()));

-- Add trigger for updated_at
CREATE TRIGGER update_ammp_sync_jobs_updated_at
BEFORE UPDATE ON public.ammp_sync_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for faster lookups
CREATE INDEX idx_ammp_sync_jobs_customer_status ON public.ammp_sync_jobs(customer_id, status);
CREATE INDEX idx_ammp_sync_jobs_user_id ON public.ammp_sync_jobs(user_id);
-- Create table for storing AMMP API credentials securely (per user)
CREATE TABLE public.ammp_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  api_key TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.ammp_connections ENABLE ROW LEVEL SECURITY;

-- Users can only view their own connection
CREATE POLICY "Users can view their own AMMP connection"
ON public.ammp_connections
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own connection
CREATE POLICY "Users can create their own AMMP connection"
ON public.ammp_connections
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own connection
CREATE POLICY "Users can update their own AMMP connection"
ON public.ammp_connections
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own connection
CREATE POLICY "Users can delete their own AMMP connection"
ON public.ammp_connections
FOR DELETE
USING (auth.uid() = user_id);

-- Add trigger for automatic timestamp updates
CREATE TRIGGER update_ammp_connections_updated_at
BEFORE UPDATE ON public.ammp_connections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
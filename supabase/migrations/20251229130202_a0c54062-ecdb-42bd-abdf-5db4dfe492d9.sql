-- Create invoice_alerts table for storing anomaly detections
CREATE TABLE public.invoice_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  is_acknowledged BOOLEAN DEFAULT false,
  acknowledged_by UUID,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  acknowledgment_note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.invoice_alerts ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view all invoice alerts"
ON public.invoice_alerts
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers and admins can create invoice alerts"
ON public.invoice_alerts
FOR INSERT
WITH CHECK ((auth.uid() = user_id) AND can_write(auth.uid()));

CREATE POLICY "Managers and admins can update invoice alerts"
ON public.invoice_alerts
FOR UPDATE
USING ((auth.uid() = user_id) AND can_write(auth.uid()));

CREATE POLICY "Managers and admins can delete invoice alerts"
ON public.invoice_alerts
FOR DELETE
USING ((auth.uid() = user_id) AND can_write(auth.uid()));

-- Create trigger for updated_at
CREATE TRIGGER update_invoice_alerts_updated_at
BEFORE UPDATE ON public.invoice_alerts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
CREATE OR REPLACE FUNCTION public.site_billing_user_unchanged(_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.site_billing_status
    WHERE id = _id
      AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.invoice_alert_user_unchanged(_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.invoice_alerts
    WHERE id = _id
      AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.notification_user_unchanged(_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.notifications
    WHERE id = _id
      AND user_id = _user_id
  );
$$;

DROP POLICY IF EXISTS "Managers and admins can update site billing" ON public.site_billing_status;
DROP POLICY IF EXISTS "Managers and admins can delete site billing" ON public.site_billing_status;
CREATE POLICY "Managers and admins can update site billing"
ON public.site_billing_status
FOR UPDATE
TO public
USING (can_write(auth.uid()))
WITH CHECK (can_write(auth.uid()) AND public.site_billing_user_unchanged(id, user_id));
CREATE POLICY "Managers and admins can delete site billing"
ON public.site_billing_status
FOR DELETE
TO public
USING (can_write(auth.uid()));

DROP POLICY IF EXISTS "Managers and admins can update invoice alerts" ON public.invoice_alerts;
DROP POLICY IF EXISTS "Managers and admins can delete invoice alerts" ON public.invoice_alerts;
CREATE POLICY "Managers and admins can update invoice alerts"
ON public.invoice_alerts
FOR UPDATE
TO public
USING (can_write(auth.uid()))
WITH CHECK (can_write(auth.uid()) AND public.invoice_alert_user_unchanged(id, user_id));
CREATE POLICY "Managers and admins can delete invoice alerts"
ON public.invoice_alerts
FOR DELETE
TO public
USING (can_write(auth.uid()));

DROP POLICY IF EXISTS "Managers and admins can update notifications" ON public.notifications;
DROP POLICY IF EXISTS "Managers and admins can delete notifications" ON public.notifications;
CREATE POLICY "Managers and admins can update notifications"
ON public.notifications
FOR UPDATE
TO public
USING (can_write(auth.uid()))
WITH CHECK (can_write(auth.uid()) AND public.notification_user_unchanged(id, user_id));
CREATE POLICY "Managers and admins can delete notifications"
ON public.notifications
FOR DELETE
TO public
USING (can_write(auth.uid()));
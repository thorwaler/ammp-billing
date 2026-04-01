CREATE OR REPLACE FUNCTION public.contract_user_unchanged(_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.contracts
    WHERE id = _id
      AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.customer_user_unchanged(_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.customers
    WHERE id = _id
      AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.invoice_user_unchanged(_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.invoices
    WHERE id = _id
      AND user_id = _user_id
  );
$$;

DROP POLICY IF EXISTS "Managers and admins can update their contracts" ON public.contracts;
CREATE POLICY "Managers and admins can update their contracts"
ON public.contracts
FOR UPDATE
USING (public.can_write(auth.uid()))
WITH CHECK (
  public.can_write(auth.uid())
  AND public.contract_user_unchanged(id, user_id)
);

DROP POLICY IF EXISTS "Managers and admins can update their customers" ON public.customers;
CREATE POLICY "Managers and admins can update their customers"
ON public.customers
FOR UPDATE
USING (public.can_write(auth.uid()))
WITH CHECK (
  public.can_write(auth.uid())
  AND public.customer_user_unchanged(id, user_id)
);

DROP POLICY IF EXISTS "Managers and admins can update their invoices" ON public.invoices;
CREATE POLICY "Managers and admins can update their invoices"
ON public.invoices
FOR UPDATE
USING (public.can_write(auth.uid()))
WITH CHECK (
  public.can_write(auth.uid())
  AND public.invoice_user_unchanged(id, user_id)
);
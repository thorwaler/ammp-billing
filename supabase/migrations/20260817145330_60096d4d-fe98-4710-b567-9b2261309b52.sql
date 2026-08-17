CREATE TABLE public.ignored_assets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_id text NOT NULL UNIQUE,
  asset_name text,
  reason text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ignored_assets TO authenticated;
GRANT ALL ON public.ignored_assets TO service_role;

ALTER TABLE public.ignored_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view ignored assets"
ON public.ignored_assets FOR SELECT TO authenticated USING (true);

CREATE POLICY "Writers can add ignored assets"
ON public.ignored_assets FOR INSERT TO authenticated
WITH CHECK (public.can_write(auth.uid()));

CREATE POLICY "Writers can update ignored assets"
ON public.ignored_assets FOR UPDATE TO authenticated
USING (public.can_write(auth.uid())) WITH CHECK (public.can_write(auth.uid()));

CREATE POLICY "Writers can remove ignored assets"
ON public.ignored_assets FOR DELETE TO authenticated
USING (public.can_write(auth.uid()));
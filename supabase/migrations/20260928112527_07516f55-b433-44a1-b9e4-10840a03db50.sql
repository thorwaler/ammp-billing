CREATE TABLE public.contract_one_off_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'EUR',
  account_code text NOT NULL DEFAULT '1000',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending_approval','pending','invoiced','dismissed')),
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','mcp')),
  source_ref text,
  requested_by text,
  idempotency_key text UNIQUE,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  invoiced_at timestamptz,
  dismissed_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_one_off_costs_contract_status ON public.contract_one_off_costs(contract_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_one_off_costs TO authenticated;
GRANT ALL ON public.contract_one_off_costs TO service_role;

ALTER TABLE public.contract_one_off_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can view one-off costs" ON public.contract_one_off_costs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Writers can add one-off costs" ON public.contract_one_off_costs
  FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "Writers can update one-off costs" ON public.contract_one_off_costs
  FOR UPDATE TO authenticated USING (public.can_write(auth.uid())) WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "Writers can delete one-off costs" ON public.contract_one_off_costs
  FOR DELETE TO authenticated USING (public.can_write(auth.uid()));

CREATE TRIGGER update_contract_one_off_costs_updated_at
  BEFORE UPDATE ON public.contract_one_off_costs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
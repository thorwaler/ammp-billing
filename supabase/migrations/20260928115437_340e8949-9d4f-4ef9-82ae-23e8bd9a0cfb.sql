DO $$
DECLARE
  v_user uuid := '5948dff5-db36-4843-a71b-f74c902ca944';
  v_customer uuid;
BEGIN
  SELECT id INTO v_customer FROM public.customers WHERE name = 'AMMP Test Lab' LIMIT 1;

  IF v_customer IS NULL THEN
    INSERT INTO public.customers (user_id, name, nickname, location, status, join_date, mwp_managed)
    VALUES (v_user, 'AMMP Test Lab', 'Test Lab', 'Internal / Sandbox', 'active', now(), 0)
    RETURNING id INTO v_customer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.contracts
    WHERE customer_id = v_customer AND contract_name = 'Pecunia Sandbox Test Contract'
  ) THEN
    INSERT INTO public.contracts (
      user_id, customer_id, company_name, contract_name, package,
      initial_mw, currency, billing_frequency, contract_status,
      invoicing_type, next_invoice_date, signed_date, notes
    )
    VALUES (
      v_user, v_customer, 'AMMP Test Lab', 'Pecunia Sandbox Test Contract', 'custom',
      0, 'EUR', 'monthly', 'active',
      'manual', (date_trunc('month', now()) + interval '1 month')::timestamptz, now(),
      'Sandbox contract for testing the Pecunia/Hermes Slack agent one-off cost flow. Not a real customer - do not invoice.'
    );
  END IF;
END $$;
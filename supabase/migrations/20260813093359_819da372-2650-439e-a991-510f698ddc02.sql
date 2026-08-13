UPDATE public.contracts
SET period_start = '2026-07-01 00:00:00+00',
    period_end = '2026-09-30 00:00:00+00',
    next_invoice_date = '2026-09-30 00:00:00+00',
    updated_at = now()
WHERE id IN (
  '4c46c10c-d959-4b9e-b04e-c71a518fa337',
  'f1a4c61a-6860-46d8-af1c-312549b0caa3',
  '35d2911e-d0c0-4e40-8e3a-9eecbc82d54a',
  '0d4d9e8d-816d-4e16-874c-2cae9cbda122',
  'ea87204a-d6ce-41fb-a5cd-cad082607030',
  'f8b02221-7039-4db8-8026-9b5196f4c7d6'
);
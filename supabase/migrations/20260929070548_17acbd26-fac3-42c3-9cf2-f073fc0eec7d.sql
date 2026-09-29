UPDATE public.invoices AS revised
SET xero_reference = original.xero_reference,
    xero_status = original.xero_status,
    xero_contact_name = original.xero_contact_name,
    merged_contract_ids = original.merged_contract_ids,
    updated_at = now()
FROM public.invoices AS original
WHERE revised.id = 'f9d1caf5-0448-465e-821b-8a77c91efd23'
  AND original.id = '22c0a5ce-2808-4d9d-88b9-9b3c09b80155';
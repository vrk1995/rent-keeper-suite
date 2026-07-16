UPDATE public.rent_payments rp
SET workspace_id = p.workspace_id
FROM public.properties p
WHERE rp.property_id = p.id
  AND rp.workspace_id IS NULL
  AND p.workspace_id IS NOT NULL;
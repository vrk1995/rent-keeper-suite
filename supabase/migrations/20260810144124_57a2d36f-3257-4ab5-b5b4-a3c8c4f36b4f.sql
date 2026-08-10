DELETE FROM public.invoices
WHERE invoice_date > CURRENT_DATE
  AND COALESCE(status,'pending') <> 'paid';

UPDATE public.invoice_sequences s
SET last_sequence = COALESCE((
  SELECT MAX((regexp_replace(i.invoice_number, '^.*-(\d+)$', '\1'))::int)
  FROM public.invoices i
  WHERE i.workspace_id = s.workspace_id
    AND i.invoice_number LIKE 'INV-' || s.prefix || '-%'
    AND (regexp_replace(i.invoice_number, '^INV-.*-(\d\d)-\d+$', '\1'))::int =
        (s.year % 100)
), 0);
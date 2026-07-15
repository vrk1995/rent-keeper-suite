-- Invoices currently have no memory of their own content — the PDF is redrawn from the
-- tenant's CURRENT bank details/PAN/GSTIN/corp numbers/owner shares every time it's
-- viewed, so editing a tenant retroactively changes what every past invoice shows. Once
-- issued, an invoice's billing details should be frozen as of that date.
--
-- Add columns to snapshot everything the PDF needs, captured once when the invoice is
-- first created (see the generate-invoice-pdf edge function). Existing invoices are
-- backfilled from CURRENT tenant/property data as a best-effort approximation — there is
-- no way to recover what was actually true on the day they were originally issued, since
-- that was never captured before this migration.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS bill_from_name TEXT,
  ADD COLUMN IF NOT EXISTS bill_from_address TEXT,
  ADD COLUMN IF NOT EXISTS bill_from_gstin TEXT,
  ADD COLUMN IF NOT EXISTS bill_from_pan TEXT,
  ADD COLUMN IF NOT EXISTS bill_from_bank_name TEXT,
  ADD COLUMN IF NOT EXISTS bill_from_account_number TEXT,
  ADD COLUMN IF NOT EXISTS bill_from_ifsc TEXT,
  ADD COLUMN IF NOT EXISTS bill_to_name TEXT,
  ADD COLUMN IF NOT EXISTS bill_to_address TEXT,
  ADD COLUMN IF NOT EXISTS bill_to_gstin TEXT,
  ADD COLUMN IF NOT EXISTS requires_gst BOOLEAN,
  ADD COLUMN IF NOT EXISTS corp_number_text TEXT,
  ADD COLUMN IF NOT EXISTS owner_shares_snapshot JSONB;

-- Backfill bill_from/bill_to/GST fields for any invoice that doesn't have them yet.
UPDATE public.invoices i
SET
  bill_from_name = COALESCE(t.bill_from_name, 'Property Owner'),
  bill_from_address = COALESCE(t.bill_from_address, p.address, ''),
  bill_from_gstin = COALESCE(t.bill_from_gstin, ''),
  bill_from_pan = COALESCE(t.bill_from_pan, ''),
  bill_from_bank_name = COALESCE(t.bill_from_bank_name, ''),
  bill_from_account_number = COALESCE(t.bill_from_account_number, ''),
  bill_from_ifsc = COALESCE(t.bill_from_ifsc, ''),
  bill_to_name = COALESCE(t.bill_to_name, t.name, 'Tenant'),
  bill_to_address = COALESCE(t.bill_to_address, ''),
  bill_to_gstin = COALESCE(t.bill_to_gstin, ''),
  requires_gst = COALESCE(t.requires_gst, false)
FROM public.tenants t
JOIN public.properties p ON p.id = i.property_id
WHERE i.tenant_id = t.id
  AND i.bill_from_name IS NULL;

-- Backfill corp numbers (comma-joined, matching the PDF's current display format).
UPDATE public.invoices i
SET corp_number_text = COALESCE(sub.corp_text, '')
FROM (
  SELECT tfu.tenant_id, string_agg(fu.corp_number, ', ') AS corp_text
  FROM public.tenant_floor_units tfu
  JOIN public.floor_units fu ON fu.id = tfu.floor_unit_id
  GROUP BY tfu.tenant_id
) sub
WHERE i.tenant_id = sub.tenant_id
  AND i.corp_number_text IS NULL;

UPDATE public.invoices
SET corp_number_text = ''
WHERE corp_number_text IS NULL;

-- Backfill owner-share split (only relevant for tenants with more than one owner).
UPDATE public.invoices i
SET owner_shares_snapshot = sub.shares
FROM (
  SELECT tos.tenant_id,
    jsonb_agg(jsonb_build_object(
      'owner_id', tos.owner_id,
      'share_percentage', tos.share_percentage,
      'owner_name', po.name
    )) AS shares
  FROM public.tenant_owner_shares tos
  JOIN public.property_owners po ON po.id = tos.owner_id
  GROUP BY tos.tenant_id
) sub
WHERE i.tenant_id = sub.tenant_id
  AND i.owner_shares_snapshot IS NULL;

UPDATE public.invoices
SET owner_shares_snapshot = '[]'::jsonb
WHERE owner_shares_snapshot IS NULL;

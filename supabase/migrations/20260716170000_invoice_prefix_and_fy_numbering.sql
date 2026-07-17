-- Invoice numbering rework:
--   1) Invoice prefix belongs to the billing address (who issues the invoice), not the
--      property (which building the rent is for) — a landlord's numbering series is tied
--      to their own entity/GSTIN, not to a specific building.
--   2) The "26" in INV-XXX-26-001 must be the FINANCIAL year (Apr 1 - Mar 31), not the
--      calendar year of the due date. The old logic used calendar year, so most invoices
--      dated April-December were mislabeled with the wrong FY.
--   3) invoice_sequences becomes keyed by (prefix, financial_year) instead of
--      (property_id, calendar_year), so every invoice sharing a prefix — regardless of
--      property — draws from one strictly-incrementing counter per financial year.

-- 1) Prefix moves to billing_addresses.
ALTER TABLE public.billing_addresses ADD COLUMN IF NOT EXISTS invoice_prefix TEXT;

-- 2) invoice_sequences: add prefix, make property_id optional (kept for reference only,
-- no longer part of the lookup key), backfill prefix from each row's property so existing
-- counters carry forward rather than resetting, then re-key the uniqueness constraint.
ALTER TABLE public.invoice_sequences ADD COLUMN IF NOT EXISTS prefix TEXT;
ALTER TABLE public.invoice_sequences ALTER COLUMN property_id DROP NOT NULL;

UPDATE public.invoice_sequences s
SET prefix = COALESCE(p.invoice_prefix, UPPER(LEFT(p.name, 3)), 'INV')
FROM public.properties p
WHERE s.property_id = p.id AND s.prefix IS NULL;

UPDATE public.invoice_sequences
SET prefix = 'INV'
WHERE prefix IS NULL;

-- Two properties could have shared a prefix already (or both fell back to the same
-- derived one) — collapse any (prefix, year) duplicates down to one row, keeping the
-- highest last_sequence, before the new unique constraint can be added.
DELETE FROM public.invoice_sequences a
USING public.invoice_sequences b
WHERE a.prefix = b.prefix AND a.year = b.year AND a.id <> b.id
  AND (a.last_sequence < b.last_sequence OR (a.last_sequence = b.last_sequence AND a.id < b.id));

ALTER TABLE public.invoice_sequences ALTER COLUMN prefix SET NOT NULL;
ALTER TABLE public.invoice_sequences DROP CONSTRAINT IF EXISTS invoice_sequences_property_id_year_key;
ALTER TABLE public.invoice_sequences DROP CONSTRAINT IF EXISTS invoice_sequences_prefix_year_key;
ALTER TABLE public.invoice_sequences ADD CONSTRAINT invoice_sequences_prefix_year_key UNIQUE (prefix, year);

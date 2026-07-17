-- Fields needed to auto-generate rent agreements (License Agreement / Lease Deed) from
-- existing Building/Tenant/Billing Address records. All additive and nullable — nothing here
-- is required for the app to keep working; the agreement generator will simply leave a blank
-- line for anything unfilled and nudge the user to fill it in.

-- 1) Billing address = the Lessor/Licensor identity for the agreement. A firm's billing
-- "name" (e.g. "Rambal Builders") isn't a signing individual, so capture the human who
-- actually signs on the firm/owner's behalf.
ALTER TABLE public.billing_addresses ADD COLUMN IF NOT EXISTS signatory_name TEXT;
ALTER TABLE public.billing_addresses ADD COLUMN IF NOT EXISTS signatory_relation TEXT;
ALTER TABLE public.billing_addresses ADD COLUMN IF NOT EXISTS signatory_age INTEGER;
ALTER TABLE public.billing_addresses ADD COLUMN IF NOT EXISTS signatory_occupation TEXT;
ALTER TABLE public.billing_addresses ADD COLUMN IF NOT EXISTS signatory_designation TEXT;
ALTER TABLE public.billing_addresses ADD COLUMN IF NOT EXISTS signatory_aadhaar TEXT;

-- 2) Property legal description — the "Schedule" section of a registered deed needs the
-- survey/village/taluk/district breakdown and boundaries, not just a free-text address.
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS survey_number TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS sub_division_number TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS village TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS taluk TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS district TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS door_number TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS boundary_north TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS boundary_south TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS boundary_east TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS boundary_west TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS undivided_share TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS building_tax_by TEXT DEFAULT 'landlord';

-- 3) Tenant = the Lessee/Licensee identity + the agreement-specific lease terms that aren't
-- "current state" of the tenancy so much as clauses of the deed itself.
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS signatory_name TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS signatory_relation TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS signatory_age INTEGER;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS signatory_occupation TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS signatory_designation TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS signatory_aadhaar TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS bill_to_pan TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS permanent_address TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS purpose_of_use TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS notice_period_months NUMERIC DEFAULT 1;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS lock_in_period_months NUMERIC;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS rent_escalation_percent NUMERIC;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS rent_escalation_frequency_years NUMERIC;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS renewal_terms TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS minor_maintenance_by TEXT DEFAULT 'tenant';
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS major_maintenance_by TEXT DEFAULT 'landlord';
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS agreement_template TEXT;

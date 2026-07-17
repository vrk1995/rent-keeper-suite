-- Rework of the rent-agreement fields after a privacy + data-model review:
--
--  1) AADHAAR IS NEVER STORED. Under the Aadhaar Act (post-Puttaswamy, Section 57 struck
--     down) a private business cannot compel Aadhaar, and the rules require masking + strong
--     safeguards for any stored Aadhaar. The DPDP Rules 2025 add consent/security/breach
--     duties on top. The lowest-risk, compliant design is data minimisation: Aadhaar is
--     typed at generation time, written straight into the document, and never persisted.
--
--  2) MULTIPLE LANDLORDS. An agreement can have more than one lessor/licensor (e.g. a firm
--     plus an individual co-owner). Landlords are now a reusable list on the PROPERTY, since
--     the same owners recur across that building's tenants.
--
--  3) The tenant's "S/o / W/o / D/o" free-text field is split into a relation type + name so
--     the UI can ask it clearly ("Father's name", "Husband's/Wife's name").

-- 1) Drop the Aadhaar columns entirely — nothing here should ever hold an Aadhaar number.
ALTER TABLE public.billing_addresses DROP COLUMN IF EXISTS signatory_aadhaar;
ALTER TABLE public.tenants DROP COLUMN IF EXISTS signatory_aadhaar;

-- 2) Landlords move to a reusable JSONB list on the property. Each entry holds the
-- non-sensitive signatory details (entity_name, signatory_name, relation_type, relation_name,
-- age, occupation, designation, address, gstin, pan) — never an Aadhaar number.
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS agreement_landlords JSONB;

-- The single-value signatory columns on billing_addresses are superseded by the property list.
ALTER TABLE public.billing_addresses DROP COLUMN IF EXISTS signatory_name;
ALTER TABLE public.billing_addresses DROP COLUMN IF EXISTS signatory_relation;
ALTER TABLE public.billing_addresses DROP COLUMN IF EXISTS signatory_age;
ALTER TABLE public.billing_addresses DROP COLUMN IF EXISTS signatory_occupation;
ALTER TABLE public.billing_addresses DROP COLUMN IF EXISTS signatory_designation;

-- 3) Split the tenant signatory relation into type + name.
ALTER TABLE public.tenants DROP COLUMN IF EXISTS signatory_relation;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS signatory_relation_type TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS signatory_relation_name TEXT;

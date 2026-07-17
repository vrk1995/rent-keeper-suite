-- A landlord or tenant on an agreement can be an INDIVIDUAL (signs personally) or an
-- ORGANISATION — a partnership firm, private/public limited company, LLP, HUF, trust,
-- society, proprietorship, etc. (signs through an authorised representative). The party
-- clause in the document is worded differently for each, so we capture the type.
--
-- Landlord party_type/org_type live inside properties.agreement_landlords (JSONB), so no
-- column is needed for them. The tenant gets its own two columns.
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS party_type TEXT;  -- 'individual' | 'organisation'
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS org_type TEXT;    -- e.g. 'Partnership Firm', 'Private Limited Company'

ALTER TABLE public.tenants DROP CONSTRAINT tenants_status_check;
ALTER TABLE public.tenants ADD CONSTRAINT tenants_status_check CHECK (status = ANY (ARRAY['active','inactive','pending','vacated']));
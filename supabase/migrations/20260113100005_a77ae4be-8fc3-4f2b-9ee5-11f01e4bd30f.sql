-- Drop the existing check constraint and add updated one with 'partial' status
ALTER TABLE public.properties DROP CONSTRAINT IF EXISTS properties_status_check;
ALTER TABLE public.properties ADD CONSTRAINT properties_status_check 
  CHECK (status = ANY (ARRAY['occupied'::text, 'vacant'::text, 'partial'::text, 'maintenance'::text]));
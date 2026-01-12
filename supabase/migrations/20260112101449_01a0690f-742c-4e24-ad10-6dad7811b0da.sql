
-- Add sqft and floors tracking to properties
ALTER TABLE public.properties 
  ADD COLUMN floors_owned INTEGER DEFAULT 1,
  ADD COLUMN total_sqft NUMERIC DEFAULT 0;

-- Add sqft tracking to units
ALTER TABLE public.units 
  ADD COLUMN total_sqft NUMERIC DEFAULT 0;

-- Add rented sqft to tenants
ALTER TABLE public.tenants 
  ADD COLUMN rented_sqft NUMERIC DEFAULT 0;

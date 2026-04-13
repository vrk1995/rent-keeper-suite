
ALTER TABLE public.property_owners
ADD COLUMN gstin text DEFAULT NULL,
ADD COLUMN billing_address text DEFAULT NULL;

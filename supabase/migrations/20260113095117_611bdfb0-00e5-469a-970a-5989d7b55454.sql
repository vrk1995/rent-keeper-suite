-- Add billing details columns to tenants table
ALTER TABLE public.tenants
ADD COLUMN bill_from_name TEXT,
ADD COLUMN bill_from_address TEXT,
ADD COLUMN bill_from_gstin TEXT,
ADD COLUMN bill_to_name TEXT,
ADD COLUMN bill_to_address TEXT,
ADD COLUMN bill_to_gstin TEXT;
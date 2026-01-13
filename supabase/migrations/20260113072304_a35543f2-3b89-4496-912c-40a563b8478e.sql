-- Add new columns to tenants table for rent, payment day, and GST preferences
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS monthly_rent numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS rent_due_day integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS requires_gst boolean DEFAULT false;
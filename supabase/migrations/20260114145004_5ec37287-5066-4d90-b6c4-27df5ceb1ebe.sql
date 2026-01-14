-- Create property_owners table to track different owners/landlords
CREATE TABLE public.property_owners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.property_owners ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own property owners"
ON public.property_owners FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create property owners"
ON public.property_owners FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own property owners"
ON public.property_owners FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own property owners"
ON public.property_owners FOR DELETE
USING (auth.uid() = user_id);

-- Add property_owner_id to properties table
ALTER TABLE public.properties
ADD COLUMN property_owner_id UUID REFERENCES public.property_owners(id) ON DELETE SET NULL;

-- Add property_owner_id to tenants table
ALTER TABLE public.tenants
ADD COLUMN property_owner_id UUID REFERENCES public.property_owners(id) ON DELETE SET NULL;

-- Create trigger for updated_at
CREATE TRIGGER update_property_owners_updated_at
BEFORE UPDATE ON public.property_owners
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
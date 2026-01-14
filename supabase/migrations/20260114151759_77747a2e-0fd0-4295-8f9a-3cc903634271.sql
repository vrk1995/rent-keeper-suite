-- Create junction table for property-owner shares
CREATE TABLE public.property_owner_shares (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.property_owners(id) ON DELETE CASCADE,
  share_percentage NUMERIC(5,2) NOT NULL CHECK (share_percentage > 0 AND share_percentage <= 100),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(property_id, owner_id)
);

-- Enable RLS
ALTER TABLE public.property_owner_shares ENABLE ROW LEVEL SECURITY;

-- RLS policies - users can manage shares for properties they own
CREATE POLICY "Users can view property owner shares"
ON public.property_owner_shares
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.properties p
    WHERE p.id = property_id AND p.owner_id = auth.uid()
  )
);

CREATE POLICY "Users can insert property owner shares"
ON public.property_owner_shares
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.properties p
    WHERE p.id = property_id AND p.owner_id = auth.uid()
  )
);

CREATE POLICY "Users can update property owner shares"
ON public.property_owner_shares
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.properties p
    WHERE p.id = property_id AND p.owner_id = auth.uid()
  )
);

CREATE POLICY "Users can delete property owner shares"
ON public.property_owner_shares
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.properties p
    WHERE p.id = property_id AND p.owner_id = auth.uid()
  )
);

-- Add trigger for updated_at
CREATE TRIGGER update_property_owner_shares_updated_at
BEFORE UPDATE ON public.property_owner_shares
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
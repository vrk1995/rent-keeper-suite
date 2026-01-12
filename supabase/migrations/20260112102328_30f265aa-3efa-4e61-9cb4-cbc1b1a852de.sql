
-- Create property_floors table for floor-wise sqft tracking
CREATE TABLE public.property_floors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  floor_name TEXT NOT NULL, -- e.g., 'G', '1', '2', 'B1' (basement)
  floor_sqft NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(property_id, floor_name)
);

-- Enable RLS
ALTER TABLE public.property_floors ENABLE ROW LEVEL SECURITY;

-- RLS policies via property ownership
CREATE POLICY "Users can view floors of their properties" 
ON public.property_floors FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.properties 
  WHERE properties.id = property_floors.property_id 
  AND properties.owner_id = auth.uid()
));

CREATE POLICY "Users can create floors for their properties" 
ON public.property_floors FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM public.properties 
  WHERE properties.id = property_floors.property_id 
  AND properties.owner_id = auth.uid()
));

CREATE POLICY "Users can update floors of their properties" 
ON public.property_floors FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM public.properties 
  WHERE properties.id = property_floors.property_id 
  AND properties.owner_id = auth.uid()
));

CREATE POLICY "Users can delete floors of their properties" 
ON public.property_floors FOR DELETE 
USING (EXISTS (
  SELECT 1 FROM public.properties 
  WHERE properties.id = property_floors.property_id 
  AND properties.owner_id = auth.uid()
));

-- Add trigger for updated_at
CREATE TRIGGER update_property_floors_updated_at
BEFORE UPDATE ON public.property_floors
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Also link tenants to specific floors
ALTER TABLE public.tenants ADD COLUMN floor_id UUID REFERENCES public.property_floors(id) ON DELETE SET NULL;

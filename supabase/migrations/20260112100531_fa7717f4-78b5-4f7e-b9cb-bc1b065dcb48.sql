
-- Create buildings table
CREATE TABLE public.buildings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  total_floors INTEGER DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create units table (can be full floor, partial floor, room, or shop)
CREATE TABLE public.units (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  floor_number INTEGER,
  unit_type TEXT NOT NULL DEFAULT 'room', -- 'full_floor', 'partial_floor', 'room', 'shop', 'commercial'
  monthly_rent NUMERIC NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'vacant', -- 'vacant', 'occupied', 'maintenance'
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

-- Buildings RLS policies
CREATE POLICY "Users can view their own buildings" 
ON public.buildings FOR SELECT 
USING (auth.uid() = owner_id);

CREATE POLICY "Users can create buildings" 
ON public.buildings FOR INSERT 
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own buildings" 
ON public.buildings FOR UPDATE 
USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete their own buildings" 
ON public.buildings FOR DELETE 
USING (auth.uid() = owner_id);

-- Units RLS policies (via building ownership)
CREATE POLICY "Users can view units of their buildings" 
ON public.units FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.buildings 
  WHERE buildings.id = units.building_id 
  AND buildings.owner_id = auth.uid()
));

CREATE POLICY "Users can create units for their buildings" 
ON public.units FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM public.buildings 
  WHERE buildings.id = units.building_id 
  AND buildings.owner_id = auth.uid()
));

CREATE POLICY "Users can update units of their buildings" 
ON public.units FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM public.buildings 
  WHERE buildings.id = units.building_id 
  AND buildings.owner_id = auth.uid()
));

CREATE POLICY "Users can delete units of their buildings" 
ON public.units FOR DELETE 
USING (EXISTS (
  SELECT 1 FROM public.buildings 
  WHERE buildings.id = units.building_id 
  AND buildings.owner_id = auth.uid()
));

-- Update tenants table to optionally reference a unit instead of just a property
ALTER TABLE public.tenants ADD COLUMN unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL;

-- Triggers for updated_at
CREATE TRIGGER update_buildings_updated_at
BEFORE UPDATE ON public.buildings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_units_updated_at
BEFORE UPDATE ON public.units
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

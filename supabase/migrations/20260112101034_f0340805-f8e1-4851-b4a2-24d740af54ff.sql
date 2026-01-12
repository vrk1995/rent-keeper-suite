
-- Add unit_id to rent_payments table for unit-level payment tracking
ALTER TABLE public.rent_payments ADD COLUMN unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL;

-- Update RLS policy to also allow payments for units in owned buildings
DROP POLICY IF EXISTS "Users can view payments of their properties" ON public.rent_payments;
DROP POLICY IF EXISTS "Users can create payments for their properties" ON public.rent_payments;
DROP POLICY IF EXISTS "Users can update payments of their properties" ON public.rent_payments;
DROP POLICY IF EXISTS "Users can delete payments of their properties" ON public.rent_payments;

CREATE POLICY "Users can view payments of their properties or units" 
ON public.rent_payments FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.properties 
    WHERE properties.id = rent_payments.property_id 
    AND properties.owner_id = auth.uid()
  )
  OR 
  EXISTS (
    SELECT 1 FROM public.units 
    JOIN public.buildings ON buildings.id = units.building_id
    WHERE units.id = rent_payments.unit_id 
    AND buildings.owner_id = auth.uid()
  )
);

CREATE POLICY "Users can create payments for their properties or units" 
ON public.rent_payments FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.properties 
    WHERE properties.id = rent_payments.property_id 
    AND properties.owner_id = auth.uid()
  )
  OR 
  EXISTS (
    SELECT 1 FROM public.units 
    JOIN public.buildings ON buildings.id = units.building_id
    WHERE units.id = rent_payments.unit_id 
    AND buildings.owner_id = auth.uid()
  )
);

CREATE POLICY "Users can update payments of their properties or units" 
ON public.rent_payments FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.properties 
    WHERE properties.id = rent_payments.property_id 
    AND properties.owner_id = auth.uid()
  )
  OR 
  EXISTS (
    SELECT 1 FROM public.units 
    JOIN public.buildings ON buildings.id = units.building_id
    WHERE units.id = rent_payments.unit_id 
    AND buildings.owner_id = auth.uid()
  )
);

CREATE POLICY "Users can delete payments of their properties or units" 
ON public.rent_payments FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.properties 
    WHERE properties.id = rent_payments.property_id 
    AND properties.owner_id = auth.uid()
  )
  OR 
  EXISTS (
    SELECT 1 FROM public.units 
    JOIN public.buildings ON buildings.id = units.building_id
    WHERE units.id = rent_payments.unit_id 
    AND buildings.owner_id = auth.uid()
  )
);

-- Update tenants RLS to also work for units
DROP POLICY IF EXISTS "Users can view tenants of their properties" ON public.tenants;
DROP POLICY IF EXISTS "Users can create tenants for their properties" ON public.tenants;
DROP POLICY IF EXISTS "Users can update tenants of their properties" ON public.tenants;
DROP POLICY IF EXISTS "Users can delete tenants of their properties" ON public.tenants;

CREATE POLICY "Users can view tenants of their properties or units" 
ON public.tenants FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.properties 
    WHERE properties.id = tenants.property_id 
    AND properties.owner_id = auth.uid()
  )
  OR 
  EXISTS (
    SELECT 1 FROM public.units 
    JOIN public.buildings ON buildings.id = units.building_id
    WHERE units.id = tenants.unit_id 
    AND buildings.owner_id = auth.uid()
  )
);

CREATE POLICY "Users can create tenants for their properties or units" 
ON public.tenants FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.properties 
    WHERE properties.id = tenants.property_id 
    AND properties.owner_id = auth.uid()
  )
  OR 
  EXISTS (
    SELECT 1 FROM public.units 
    JOIN public.buildings ON buildings.id = units.building_id
    WHERE units.id = tenants.unit_id 
    AND buildings.owner_id = auth.uid()
  )
);

CREATE POLICY "Users can update tenants of their properties or units" 
ON public.tenants FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.properties 
    WHERE properties.id = tenants.property_id 
    AND properties.owner_id = auth.uid()
  )
  OR 
  EXISTS (
    SELECT 1 FROM public.units 
    JOIN public.buildings ON buildings.id = units.building_id
    WHERE units.id = tenants.unit_id 
    AND buildings.owner_id = auth.uid()
  )
);

CREATE POLICY "Users can delete tenants of their properties or units" 
ON public.tenants FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.properties 
    WHERE properties.id = tenants.property_id 
    AND properties.owner_id = auth.uid()
  )
  OR 
  EXISTS (
    SELECT 1 FROM public.units 
    JOIN public.buildings ON buildings.id = units.building_id
    WHERE units.id = tenants.unit_id 
    AND buildings.owner_id = auth.uid()
  )
);

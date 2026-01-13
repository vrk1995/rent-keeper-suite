-- Add property_id to units table to link units directly to properties
ALTER TABLE public.units ADD COLUMN property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE;

-- Update RLS policies for units to use property ownership
DROP POLICY IF EXISTS "Users can view units of their buildings" ON public.units;
DROP POLICY IF EXISTS "Users can create units for their buildings" ON public.units;
DROP POLICY IF EXISTS "Users can update units of their buildings" ON public.units;
DROP POLICY IF EXISTS "Users can delete units of their buildings" ON public.units;

-- New RLS policies for units based on property ownership
CREATE POLICY "Users can view units of their properties" 
ON public.units 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM properties 
  WHERE properties.id = units.property_id 
  AND properties.owner_id = auth.uid()
));

CREATE POLICY "Users can create units for their properties" 
ON public.units 
FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM properties 
  WHERE properties.id = units.property_id 
  AND properties.owner_id = auth.uid()
));

CREATE POLICY "Users can update units of their properties" 
ON public.units 
FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM properties 
  WHERE properties.id = units.property_id 
  AND properties.owner_id = auth.uid()
));

CREATE POLICY "Users can delete units of their properties" 
ON public.units 
FOR DELETE 
USING (EXISTS (
  SELECT 1 FROM properties 
  WHERE properties.id = units.property_id 
  AND properties.owner_id = auth.uid()
));

-- Update RLS policies for rent_payments to use property-based unit lookup
DROP POLICY IF EXISTS "Users can view payments of their properties or units" ON public.rent_payments;
DROP POLICY IF EXISTS "Users can create payments for their properties or units" ON public.rent_payments;
DROP POLICY IF EXISTS "Users can update payments of their properties or units" ON public.rent_payments;
DROP POLICY IF EXISTS "Users can delete payments of their properties or units" ON public.rent_payments;

CREATE POLICY "Users can view payments of their properties or units" 
ON public.rent_payments 
FOR SELECT 
USING (
  EXISTS (SELECT 1 FROM properties WHERE properties.id = rent_payments.property_id AND properties.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM units JOIN properties ON properties.id = units.property_id WHERE units.id = rent_payments.unit_id AND properties.owner_id = auth.uid())
);

CREATE POLICY "Users can create payments for their properties or units" 
ON public.rent_payments 
FOR INSERT 
WITH CHECK (
  EXISTS (SELECT 1 FROM properties WHERE properties.id = rent_payments.property_id AND properties.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM units JOIN properties ON properties.id = units.property_id WHERE units.id = rent_payments.unit_id AND properties.owner_id = auth.uid())
);

CREATE POLICY "Users can update payments of their properties or units" 
ON public.rent_payments 
FOR UPDATE 
USING (
  EXISTS (SELECT 1 FROM properties WHERE properties.id = rent_payments.property_id AND properties.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM units JOIN properties ON properties.id = units.property_id WHERE units.id = rent_payments.unit_id AND properties.owner_id = auth.uid())
);

CREATE POLICY "Users can delete payments of their properties or units" 
ON public.rent_payments 
FOR DELETE 
USING (
  EXISTS (SELECT 1 FROM properties WHERE properties.id = rent_payments.property_id AND properties.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM units JOIN properties ON properties.id = units.property_id WHERE units.id = rent_payments.unit_id AND properties.owner_id = auth.uid())
);

-- Update RLS policies for tenants to use property-based unit lookup
DROP POLICY IF EXISTS "Users can view tenants of their properties or units" ON public.tenants;
DROP POLICY IF EXISTS "Users can create tenants for their properties or units" ON public.tenants;
DROP POLICY IF EXISTS "Users can update tenants of their properties or units" ON public.tenants;
DROP POLICY IF EXISTS "Users can delete tenants of their properties or units" ON public.tenants;

CREATE POLICY "Users can view tenants of their properties or units" 
ON public.tenants 
FOR SELECT 
USING (
  EXISTS (SELECT 1 FROM properties WHERE properties.id = tenants.property_id AND properties.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM units JOIN properties ON properties.id = units.property_id WHERE units.id = tenants.unit_id AND properties.owner_id = auth.uid())
);

CREATE POLICY "Users can create tenants for their properties or units" 
ON public.tenants 
FOR INSERT 
WITH CHECK (
  EXISTS (SELECT 1 FROM properties WHERE properties.id = tenants.property_id AND properties.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM units JOIN properties ON properties.id = units.property_id WHERE units.id = tenants.unit_id AND properties.owner_id = auth.uid())
);

CREATE POLICY "Users can update tenants of their properties or units" 
ON public.tenants 
FOR UPDATE 
USING (
  EXISTS (SELECT 1 FROM properties WHERE properties.id = tenants.property_id AND properties.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM units JOIN properties ON properties.id = units.property_id WHERE units.id = tenants.unit_id AND properties.owner_id = auth.uid())
);

CREATE POLICY "Users can delete tenants of their properties or units" 
ON public.tenants 
FOR DELETE 
USING (
  EXISTS (SELECT 1 FROM properties WHERE properties.id = tenants.property_id AND properties.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM units JOIN properties ON properties.id = units.property_id WHERE units.id = tenants.unit_id AND properties.owner_id = auth.uid())
);
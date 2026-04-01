
-- Table to store rent increment rules per tenant
CREATE TABLE public.rent_increments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  increment_type TEXT NOT NULL DEFAULT 'percentage', -- 'percentage' or 'fixed'
  increment_value NUMERIC NOT NULL DEFAULT 0, -- percentage value or fixed amount
  interval_months INTEGER NOT NULL DEFAULT 12, -- how often in months
  next_increment_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table to store full history of rent changes
CREATE TABLE public.rent_increment_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  previous_rent NUMERIC NOT NULL,
  new_rent NUMERIC NOT NULL,
  increment_type TEXT NOT NULL, -- 'percentage' or 'fixed'
  increment_value NUMERIC NOT NULL,
  effective_date DATE NOT NULL,
  applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS for rent_increments
ALTER TABLE public.rent_increments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view rent increments of their tenants"
ON public.rent_increments FOR SELECT
USING (EXISTS (
  SELECT 1 FROM tenants t JOIN properties p ON p.id = t.property_id
  WHERE t.id = rent_increments.tenant_id AND p.owner_id = auth.uid()
));

CREATE POLICY "Users can create rent increments for their tenants"
ON public.rent_increments FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM tenants t JOIN properties p ON p.id = t.property_id
  WHERE t.id = rent_increments.tenant_id AND p.owner_id = auth.uid()
));

CREATE POLICY "Users can update rent increments of their tenants"
ON public.rent_increments FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM tenants t JOIN properties p ON p.id = t.property_id
  WHERE t.id = rent_increments.tenant_id AND p.owner_id = auth.uid()
));

CREATE POLICY "Users can delete rent increments of their tenants"
ON public.rent_increments FOR DELETE
USING (EXISTS (
  SELECT 1 FROM tenants t JOIN properties p ON p.id = t.property_id
  WHERE t.id = rent_increments.tenant_id AND p.owner_id = auth.uid()
));

-- RLS for rent_increment_history
ALTER TABLE public.rent_increment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view rent increment history of their tenants"
ON public.rent_increment_history FOR SELECT
USING (EXISTS (
  SELECT 1 FROM tenants t JOIN properties p ON p.id = t.property_id
  WHERE t.id = rent_increment_history.tenant_id AND p.owner_id = auth.uid()
));

CREATE POLICY "Users can create rent increment history for their tenants"
ON public.rent_increment_history FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM tenants t JOIN properties p ON p.id = t.property_id
  WHERE t.id = rent_increment_history.tenant_id AND p.owner_id = auth.uid()
));

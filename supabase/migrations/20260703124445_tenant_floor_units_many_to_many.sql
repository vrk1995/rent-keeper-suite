-- Allow a tenant to hold multiple corp numbers, and a corp number to be shared by multiple tenants
CREATE TABLE public.tenant_floor_units (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  floor_unit_id UUID NOT NULL REFERENCES public.floor_units(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, floor_unit_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_floor_units TO authenticated;
GRANT ALL ON public.tenant_floor_units TO service_role;

ALTER TABLE public.tenant_floor_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can view tenant floor units" ON public.tenant_floor_units
  FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "Team editors can insert tenant floor units" ON public.tenant_floor_units
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_team(auth.uid()));
CREATE POLICY "Team editors can update tenant floor units" ON public.tenant_floor_units
  FOR UPDATE TO authenticated USING (public.can_edit_team(auth.uid())) WITH CHECK (public.can_edit_team(auth.uid()));
CREATE POLICY "Team editors can delete tenant floor units" ON public.tenant_floor_units
  FOR DELETE TO authenticated USING (public.can_edit_team(auth.uid()));

CREATE INDEX idx_tenant_floor_units_tenant ON public.tenant_floor_units(tenant_id);
CREATE INDEX idx_tenant_floor_units_floor_unit ON public.tenant_floor_units(floor_unit_id);

-- Backfill existing single assignments into the junction table
INSERT INTO public.tenant_floor_units (tenant_id, floor_unit_id)
SELECT id, floor_unit_id FROM public.tenants WHERE floor_unit_id IS NOT NULL
ON CONFLICT (tenant_id, floor_unit_id) DO NOTHING;

-- Superseded by tenant_floor_units (many-to-many)
ALTER TABLE public.tenants DROP COLUMN IF EXISTS floor_unit_id;

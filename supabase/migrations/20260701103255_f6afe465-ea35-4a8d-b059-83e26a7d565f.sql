
CREATE TABLE public.floor_units (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  floor_id UUID NOT NULL REFERENCES public.property_floors(id) ON DELETE CASCADE,
  corp_number TEXT NOT NULL,
  area_sqft NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (floor_id, corp_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.floor_units TO authenticated;
GRANT ALL ON public.floor_units TO service_role;

ALTER TABLE public.floor_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can view floor units" ON public.floor_units
  FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "Team editors can insert floor units" ON public.floor_units
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_team(auth.uid()));
CREATE POLICY "Team editors can update floor units" ON public.floor_units
  FOR UPDATE TO authenticated USING (public.can_edit_team(auth.uid())) WITH CHECK (public.can_edit_team(auth.uid()));
CREATE POLICY "Team editors can delete floor units" ON public.floor_units
  FOR DELETE TO authenticated USING (public.can_edit_team(auth.uid()));

CREATE TRIGGER update_floor_units_updated_at
  BEFORE UPDATE ON public.floor_units
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_floor_units_property ON public.floor_units(property_id);
CREATE INDEX idx_floor_units_floor ON public.floor_units(floor_id);

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS floor_unit_id UUID REFERENCES public.floor_units(id) ON DELETE SET NULL;
ALTER TABLE public.property_expenses ADD COLUMN IF NOT EXISTS floor_unit_id UUID REFERENCES public.floor_units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tenants_floor_unit ON public.tenants(floor_unit_id);
CREATE INDEX IF NOT EXISTS idx_property_expenses_floor_unit ON public.property_expenses(floor_unit_id);

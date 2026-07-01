
-- Helper functions
CREATE OR REPLACE FUNCTION public.is_team_member(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

CREATE OR REPLACE FUNCTION public.can_edit_team(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('super_admin','admin','member')
  )
$$;

-- Generic helper to replace policies on a table with team-shared ones
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'properties','tenants','units','property_floors','rent_payments','invoices',
    'invoice_sequences','property_expenses','property_owners','property_owner_shares',
    'tenant_owner_shares','documents','reminders','rent_increments',
    'rent_increment_history','buildings'
  ];
  pol record;
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=tbl LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
    END LOOP;

    EXECUTE format($f$
      CREATE POLICY "Team members can view %1$s"
      ON public.%1$I FOR SELECT TO authenticated
      USING (public.is_team_member(auth.uid()))
    $f$, tbl);

    EXECUTE format($f$
      CREATE POLICY "Team editors can insert %1$s"
      ON public.%1$I FOR INSERT TO authenticated
      WITH CHECK (public.can_edit_team(auth.uid()))
    $f$, tbl);

    EXECUTE format($f$
      CREATE POLICY "Team editors can update %1$s"
      ON public.%1$I FOR UPDATE TO authenticated
      USING (public.can_edit_team(auth.uid()))
      WITH CHECK (public.can_edit_team(auth.uid()))
    $f$, tbl);

    EXECUTE format($f$
      CREATE POLICY "Team editors can delete %1$s"
      ON public.%1$I FOR DELETE TO authenticated
      USING (public.can_edit_team(auth.uid()))
    $f$, tbl);
  END LOOP;
END $$;

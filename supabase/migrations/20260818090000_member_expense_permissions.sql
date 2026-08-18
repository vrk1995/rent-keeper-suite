-- Members can now add expenses (previously admin-tier only), and edit expenses they
-- created themselves; admin tier keeps full edit rights over any expense. Deleting stays
-- admin-only, unchanged. Every insert/update/delete on property_expenses now also gets a
-- full audit trail entry via the existing generic activity log trigger.

CREATE OR REPLACE FUNCTION public.can_add_expenses(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('super_admin','admin','member')
      AND workspace_id = public.current_workspace_id()
  )
$$;

DROP POLICY IF EXISTS "ws_insert" ON public.property_expenses;
DROP POLICY IF EXISTS "ws_update" ON public.property_expenses;

CREATE POLICY "ws_insert" ON public.property_expenses FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id = public.current_workspace_id()
    AND public.can_add_expenses(auth.uid())
    AND public.has_property_access(auth.uid(), property_id)
  );

CREATE POLICY "ws_update" ON public.property_expenses FOR UPDATE TO authenticated
  USING (
    workspace_id = public.current_workspace_id()
    AND public.has_property_access(auth.uid(), property_id)
    AND (public.can_edit_team(auth.uid()) OR (public.can_add_expenses(auth.uid()) AND created_by = auth.uid()))
  )
  WITH CHECK (
    workspace_id = public.current_workspace_id()
    AND public.has_property_access(auth.uid(), property_id)
    AND (public.can_edit_team(auth.uid()) OR (public.can_add_expenses(auth.uid()) AND created_by = auth.uid()))
  );

DROP TRIGGER IF EXISTS log_activity_trigger ON public.property_expenses;
CREATE TRIGGER log_activity_trigger AFTER INSERT OR UPDATE OR DELETE ON public.property_expenses
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

-- Members should only be able to record rent payments (add + mark paid) and view/download
-- invoices. They should lose the generic team-editor rights they currently share with
-- admin/super_admin on every other table (buildings, properties, tenants, units, floors,
-- owners, expenses, reminders, documents, rent increments, etc).

-- Tighten can_edit_team to admin-tier only. This function backs the "ws_insert"/"ws_update"/
-- "ws_delete" policies on every workspace-scoped table (see 20260704061325), so redefining its
-- body here cascades the restriction everywhere without touching each table's policies.
CREATE OR REPLACE FUNCTION public.can_edit_team(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('super_admin','admin')
  )
$$;

-- New: members keep the narrower ability to record payments and sync invoice status.
CREATE OR REPLACE FUNCTION public.can_record_payments(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('super_admin','admin','member')
  )
$$;

-- rent_payments: members can still add a payment and mark one paid (both flows are just an
-- INSERT or UPDATE on this table). Deleting a payment record stays admin-only via can_edit_team,
-- which the pre-existing "ws_delete" policy already uses unchanged.
DROP POLICY IF EXISTS "ws_insert" ON public.rent_payments;
DROP POLICY IF EXISTS "ws_update" ON public.rent_payments;

CREATE POLICY "ws_insert" ON public.rent_payments FOR INSERT TO authenticated
  WITH CHECK (workspace_id = public.current_workspace_id() AND public.can_record_payments(auth.uid()));

CREATE POLICY "ws_update" ON public.rent_payments FOR UPDATE TO authenticated
  USING (workspace_id = public.current_workspace_id() AND public.can_record_payments(auth.uid()))
  WITH CHECK (workspace_id = public.current_workspace_id() AND public.can_record_payments(auth.uid()));

-- invoices: marking a payment paid (or undoing that) auto-syncs the linked invoice's status —
-- members need UPDATE for that side effect to go through. Creating/deleting invoices directly
-- stays admin-only via the existing can_edit_team-backed "ws_insert"/"ws_delete" policies.
DROP POLICY IF EXISTS "ws_update" ON public.invoices;

CREATE POLICY "ws_update" ON public.invoices FOR UPDATE TO authenticated
  USING (workspace_id = public.current_workspace_id() AND public.can_record_payments(auth.uid()))
  WITH CHECK (workspace_id = public.current_workspace_id() AND public.can_record_payments(auth.uid()));

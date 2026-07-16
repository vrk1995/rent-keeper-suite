-- Property-scoped access: admins/members can be limited to specific properties, and every
-- role helper becomes workspace-aware so a role in one workspace grants nothing in another.
--
-- Access model: a user with NO rows in user_property_access is unrestricted (sees the whole
-- workspace — today's behavior, so nothing changes until someone is explicitly scoped).
-- A user WITH rows only sees/edits data belonging to those properties. Super admins of the
-- workspace are always unrestricted. Buildings and property_owners stay workspace-wide.

-- ============================================================================
-- 1. Workspace-scope the role helper functions
-- ============================================================================
-- These previously matched a role in ANY workspace, which would leak privileges across
-- workspaces once more than one exists.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
      AND workspace_id = public.current_workspace_id()
  )
$$;

-- Previously matched ONLY role='admin', silently excluding super_admin from the user_roles
-- and workspaces management policies that use it. Intent everywhere is "admin tier".
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('super_admin','admin')
      AND workspace_id = public.current_workspace_id()
  )
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'
      AND workspace_id = public.current_workspace_id()
  )
$$;

CREATE OR REPLACE FUNCTION public.can_edit_team(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('super_admin','admin')
      AND workspace_id = public.current_workspace_id()
  )
$$;

CREATE OR REPLACE FUNCTION public.can_record_payments(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('super_admin','admin','member')
      AND workspace_id = public.current_workspace_id()
  )
$$;

-- ============================================================================
-- 2. user_property_access: which properties a scoped user may touch
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_property_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL DEFAULT public.current_workspace_id() REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, property_id)
);

CREATE INDEX IF NOT EXISTS user_property_access_user_id_idx
  ON public.user_property_access (user_id);
CREATE INDEX IF NOT EXISTS user_property_access_workspace_id_idx
  ON public.user_property_access (workspace_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_property_access TO authenticated;
GRANT ALL ON public.user_property_access TO service_role;

ALTER TABLE public.user_property_access ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. Access-check helpers
-- ============================================================================
-- Unrestricted (no rows in this workspace) or explicitly granted. NULL property_id means
-- workspace-level data (e.g. a document not tied to any property) — visible to everyone
-- in the workspace. Super admins bypass scoping entirely.
CREATE OR REPLACE FUNCTION public.has_property_access(_user_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    _property_id IS NULL
    OR public.is_super_admin(_user_id)
    OR NOT EXISTS (
      SELECT 1 FROM public.user_property_access
      WHERE user_id = _user_id AND workspace_id = public.current_workspace_id()
    )
    OR EXISTS (
      SELECT 1 FROM public.user_property_access
      WHERE user_id = _user_id AND property_id = _property_id
    )
$$;

CREATE OR REPLACE FUNCTION public.has_tenant_access(_user_id uuid, _tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _tenant_id IS NULL OR EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id = _tenant_id AND public.has_property_access(_user_id, t.property_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.has_rent_payment_access(_user_id uuid, _rent_payment_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _rent_payment_id IS NULL OR EXISTS (
    SELECT 1 FROM public.rent_payments rp
    WHERE rp.id = _rent_payment_id AND public.has_property_access(_user_id, rp.property_id)
  )
$$;

-- user_property_access's own policies (defined after the helpers they use):
-- team members can see who has access to what; only admin tier can grant, and a scoped
-- admin can only grant properties they themselves have access to. Deleting a grant is
-- similarly limited to properties within the deleter's own scope.
CREATE POLICY "ws_select" ON public.user_property_access FOR SELECT TO authenticated
  USING (workspace_id = public.current_workspace_id());

CREATE POLICY "ws_insert" ON public.user_property_access FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id = public.current_workspace_id()
    AND public.can_edit_team(auth.uid())
    AND public.has_property_access(auth.uid(), property_id)
  );

CREATE POLICY "ws_delete" ON public.user_property_access FOR DELETE TO authenticated
  USING (
    workspace_id = public.current_workspace_id()
    AND public.can_edit_team(auth.uid())
    AND public.has_property_access(auth.uid(), property_id)
  );

-- ============================================================================
-- 4. Rewrite RLS policies to include the property check
-- ============================================================================
-- properties: scoped by the row's own id. Note the INSERT check — a scoped admin cannot
-- create new properties (a brand-new id can't be in anyone's access list); unrestricted
-- admins and super admins can, since has_property_access is true for them on any id.
DROP POLICY IF EXISTS "ws_select" ON public.properties;
DROP POLICY IF EXISTS "ws_insert" ON public.properties;
DROP POLICY IF EXISTS "ws_update" ON public.properties;
DROP POLICY IF EXISTS "ws_delete" ON public.properties;

CREATE POLICY "ws_select" ON public.properties FOR SELECT TO authenticated
  USING (workspace_id = public.current_workspace_id() AND public.has_property_access(auth.uid(), id));
CREATE POLICY "ws_insert" ON public.properties FOR INSERT TO authenticated
  WITH CHECK (workspace_id = public.current_workspace_id() AND public.can_edit_team(auth.uid()) AND public.has_property_access(auth.uid(), id));
CREATE POLICY "ws_update" ON public.properties FOR UPDATE TO authenticated
  USING (workspace_id = public.current_workspace_id() AND public.can_edit_team(auth.uid()) AND public.has_property_access(auth.uid(), id))
  WITH CHECK (workspace_id = public.current_workspace_id() AND public.can_edit_team(auth.uid()) AND public.has_property_access(auth.uid(), id));
CREATE POLICY "ws_delete" ON public.properties FOR DELETE TO authenticated
  USING (workspace_id = public.current_workspace_id() AND public.can_edit_team(auth.uid()) AND public.has_property_access(auth.uid(), id));

-- Tables carrying property_id directly, with the standard can_edit_team write policies.
-- (documents/reminders/units have nullable property_id; has_property_access treats NULL
-- as workspace-level and allows it, so the same expression covers both cases.)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenants','invoice_sequences','property_floors','floor_units',
    'property_expenses','property_owner_shares','documents','reminders','units'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "ws_select" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "ws_insert" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "ws_update" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "ws_delete" ON public.%I', t);

    EXECUTE format('CREATE POLICY "ws_select" ON public.%I FOR SELECT TO authenticated USING (workspace_id = public.current_workspace_id() AND public.has_property_access(auth.uid(), property_id))', t);
    EXECUTE format('CREATE POLICY "ws_insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (workspace_id = public.current_workspace_id() AND public.can_edit_team(auth.uid()) AND public.has_property_access(auth.uid(), property_id))', t);
    EXECUTE format('CREATE POLICY "ws_update" ON public.%I FOR UPDATE TO authenticated USING (workspace_id = public.current_workspace_id() AND public.can_edit_team(auth.uid()) AND public.has_property_access(auth.uid(), property_id)) WITH CHECK (workspace_id = public.current_workspace_id() AND public.can_edit_team(auth.uid()) AND public.has_property_access(auth.uid(), property_id))', t);
    EXECUTE format('CREATE POLICY "ws_delete" ON public.%I FOR DELETE TO authenticated USING (workspace_id = public.current_workspace_id() AND public.can_edit_team(auth.uid()) AND public.has_property_access(auth.uid(), property_id))', t);
  END LOOP;
END$$;

-- Tables scoped through their tenant (no property_id of their own).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'rent_increments','rent_increment_history','tenant_floor_units','tenant_owner_shares'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "ws_select" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "ws_insert" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "ws_update" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "ws_delete" ON public.%I', t);

    EXECUTE format('CREATE POLICY "ws_select" ON public.%I FOR SELECT TO authenticated USING (workspace_id = public.current_workspace_id() AND public.has_tenant_access(auth.uid(), tenant_id))', t);
    EXECUTE format('CREATE POLICY "ws_insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (workspace_id = public.current_workspace_id() AND public.can_edit_team(auth.uid()) AND public.has_tenant_access(auth.uid(), tenant_id))', t);
    EXECUTE format('CREATE POLICY "ws_update" ON public.%I FOR UPDATE TO authenticated USING (workspace_id = public.current_workspace_id() AND public.can_edit_team(auth.uid()) AND public.has_tenant_access(auth.uid(), tenant_id)) WITH CHECK (workspace_id = public.current_workspace_id() AND public.can_edit_team(auth.uid()) AND public.has_tenant_access(auth.uid(), tenant_id))', t);
    EXECUTE format('CREATE POLICY "ws_delete" ON public.%I FOR DELETE TO authenticated USING (workspace_id = public.current_workspace_id() AND public.can_edit_team(auth.uid()) AND public.has_tenant_access(auth.uid(), tenant_id))', t);
  END LOOP;
END$$;

-- rent_payments: members can record payments, but only within their property scope.
DROP POLICY IF EXISTS "ws_select" ON public.rent_payments;
DROP POLICY IF EXISTS "ws_insert" ON public.rent_payments;
DROP POLICY IF EXISTS "ws_update" ON public.rent_payments;
DROP POLICY IF EXISTS "ws_delete" ON public.rent_payments;

CREATE POLICY "ws_select" ON public.rent_payments FOR SELECT TO authenticated
  USING (workspace_id = public.current_workspace_id() AND public.has_property_access(auth.uid(), property_id));
CREATE POLICY "ws_insert" ON public.rent_payments FOR INSERT TO authenticated
  WITH CHECK (workspace_id = public.current_workspace_id() AND public.can_record_payments(auth.uid()) AND public.has_property_access(auth.uid(), property_id));
CREATE POLICY "ws_update" ON public.rent_payments FOR UPDATE TO authenticated
  USING (workspace_id = public.current_workspace_id() AND public.can_record_payments(auth.uid()) AND public.has_property_access(auth.uid(), property_id))
  WITH CHECK (workspace_id = public.current_workspace_id() AND public.can_record_payments(auth.uid()) AND public.has_property_access(auth.uid(), property_id));
CREATE POLICY "ws_delete" ON public.rent_payments FOR DELETE TO authenticated
  USING (workspace_id = public.current_workspace_id() AND public.can_edit_team(auth.uid()) AND public.has_property_access(auth.uid(), property_id));

-- invoices: members may update (payment-status sync side effect); create/delete is admin
-- tier — all limited to the caller's property scope.
DROP POLICY IF EXISTS "ws_select" ON public.invoices;
DROP POLICY IF EXISTS "ws_insert" ON public.invoices;
DROP POLICY IF EXISTS "ws_update" ON public.invoices;
DROP POLICY IF EXISTS "ws_delete" ON public.invoices;

CREATE POLICY "ws_select" ON public.invoices FOR SELECT TO authenticated
  USING (workspace_id = public.current_workspace_id() AND public.has_property_access(auth.uid(), property_id));
CREATE POLICY "ws_insert" ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (workspace_id = public.current_workspace_id() AND public.can_edit_team(auth.uid()) AND public.has_property_access(auth.uid(), property_id));
CREATE POLICY "ws_update" ON public.invoices FOR UPDATE TO authenticated
  USING (workspace_id = public.current_workspace_id() AND public.can_record_payments(auth.uid()) AND public.has_property_access(auth.uid(), property_id))
  WITH CHECK (workspace_id = public.current_workspace_id() AND public.can_record_payments(auth.uid()) AND public.has_property_access(auth.uid(), property_id));
CREATE POLICY "ws_delete" ON public.invoices FOR DELETE TO authenticated
  USING (workspace_id = public.current_workspace_id() AND public.can_edit_team(auth.uid()) AND public.has_property_access(auth.uid(), property_id));

-- payment_transactions: scoped through the parent rent_payment's property.
DROP POLICY IF EXISTS "ws_select" ON public.payment_transactions;
DROP POLICY IF EXISTS "ws_insert" ON public.payment_transactions;
DROP POLICY IF EXISTS "ws_update" ON public.payment_transactions;
DROP POLICY IF EXISTS "ws_delete" ON public.payment_transactions;

CREATE POLICY "ws_select" ON public.payment_transactions FOR SELECT TO authenticated
  USING (workspace_id = public.current_workspace_id() AND public.has_rent_payment_access(auth.uid(), rent_payment_id));
CREATE POLICY "ws_insert" ON public.payment_transactions FOR INSERT TO authenticated
  WITH CHECK (workspace_id = public.current_workspace_id() AND public.can_record_payments(auth.uid()) AND public.has_rent_payment_access(auth.uid(), rent_payment_id));
CREATE POLICY "ws_update" ON public.payment_transactions FOR UPDATE TO authenticated
  USING (workspace_id = public.current_workspace_id() AND public.can_record_payments(auth.uid()) AND public.has_rent_payment_access(auth.uid(), rent_payment_id))
  WITH CHECK (workspace_id = public.current_workspace_id() AND public.can_record_payments(auth.uid()) AND public.has_rent_payment_access(auth.uid(), rent_payment_id));
CREATE POLICY "ws_delete" ON public.payment_transactions FOR DELETE TO authenticated
  USING (workspace_id = public.current_workspace_id() AND public.can_edit_team(auth.uid()) AND public.has_rent_payment_access(auth.uid(), rent_payment_id));

-- ============================================================================
-- 5. Invites can carry a property scope
-- ============================================================================
-- NULL/empty = unrestricted (current behavior). Set = the invitee gets exactly these
-- user_property_access rows on acceptance.
ALTER TABLE public.team_invites
  ADD COLUMN IF NOT EXISTS property_ids UUID[];

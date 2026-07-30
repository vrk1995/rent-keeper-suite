-- The user_roles policies only ever checked that the CALLER already held admin tier
-- (is_admin(), true for both 'admin' and 'super_admin'), never what role was being written
-- into the row. That let any admin — including one deliberately restricted to a single
-- property via user_property_access — promote their own row (or anyone else's) straight to
-- 'super_admin', which bypasses property scoping entirely (has_property_access() treats
-- super admins as unrestricted). The same gap let any admin mint further admins, each of
-- which could do the same thing.
--
-- Only a super admin may now insert/update a row that grants 'admin' or 'super_admin'; an
-- ordinary admin is limited to 'member'/'viewer' rows. Demoting or removing an existing
-- admin/super_admin row likewise now requires the caller to already be a super admin.

DROP POLICY IF EXISTS "Admins can insert roles in workspace" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles in workspace" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles in workspace" ON public.user_roles;

CREATE POLICY "Admins can insert roles in workspace" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id = public.current_workspace_id()
    AND public.is_admin(auth.uid())
    AND (role NOT IN ('admin', 'super_admin') OR public.is_super_admin(auth.uid()))
  );

CREATE POLICY "Admins can update roles in workspace" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (
    workspace_id = public.current_workspace_id()
    AND public.is_admin(auth.uid())
    AND (role NOT IN ('admin', 'super_admin') OR public.is_super_admin(auth.uid()))
  )
  WITH CHECK (
    workspace_id = public.current_workspace_id()
    AND public.is_admin(auth.uid())
    AND (role NOT IN ('admin', 'super_admin') OR public.is_super_admin(auth.uid()))
  );

CREATE POLICY "Admins can delete roles in workspace" ON public.user_roles
  FOR DELETE TO authenticated
  USING (
    workspace_id = public.current_workspace_id()
    AND public.is_admin(auth.uid())
    AND user_id <> auth.uid()
    AND (role NOT IN ('admin', 'super_admin') OR public.is_super_admin(auth.uid()))
  );

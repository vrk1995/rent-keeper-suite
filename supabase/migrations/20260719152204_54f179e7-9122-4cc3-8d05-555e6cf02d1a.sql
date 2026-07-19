
-- 1. Enable RLS on payment_transactions
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

-- 2. Prevent users from escalating their own role/approval via profiles
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_super_admin(auth.uid()) OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    NEW.role := OLD.role;
  END IF;
  IF NEW.is_approved IS DISTINCT FROM OLD.is_approved THEN
    NEW.is_approved := OLD.is_approved;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_profile_privilege_escalation_trg ON public.profiles;
CREATE TRIGGER prevent_profile_privilege_escalation_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- Also tighten the self-update policy with an explicit WITH CHECK
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. Explicit-workspace variant of current_workspace_id to remove ambiguity for
-- multi-workspace users. current_workspace_id() is retained for backwards
-- compatibility but now deterministically resolves via app.current_workspace GUC
-- when set, falling back to the earliest membership.
CREATE OR REPLACE FUNCTION public.current_workspace_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ws_setting text;
  ws uuid;
BEGIN
  BEGIN
    ws_setting := current_setting('app.current_workspace_id', true);
  EXCEPTION WHEN OTHERS THEN
    ws_setting := NULL;
  END;

  IF ws_setting IS NOT NULL AND ws_setting <> '' THEN
    BEGIN
      ws := ws_setting::uuid;
    EXCEPTION WHEN OTHERS THEN
      ws := NULL;
    END;
    -- Only honor the requested workspace if the caller actually belongs to it.
    IF ws IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND workspace_id = ws
    ) THEN
      RETURN ws;
    END IF;
  END IF;

  SELECT workspace_id INTO ws
  FROM public.user_roles
  WHERE user_id = auth.uid()
  ORDER BY created_at ASC
  LIMIT 1;
  RETURN ws;
END;
$$;

-- 4. Lock down SECURITY DEFINER functions that should never be called by API roles.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_admin_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_activity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.daily_payment_processing() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_monthly_rent_payments() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_overdue_payments() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_profile_privilege_escalation() FROM PUBLIC, anon, authenticated;

-- Revoke anon from all remaining RLS helpers (still callable by authenticated for RLS evaluation).
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_team_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_user_approved(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_edit_team(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_record_payments(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_property_access(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_rent_payment_access(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_tenant_access(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_workspace_id() FROM PUBLIC, anon;

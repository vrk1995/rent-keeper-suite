
-- 1. Workspaces table
CREATE TABLE IF NOT EXISTS public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces TO authenticated;
GRANT ALL ON public.workspaces TO service_role;

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

INSERT INTO public.workspaces (id, name, created_by)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Workspace',
        '5ff6a283-78f2-4cad-a871-931805fa402e')
ON CONFLICT (id) DO NOTHING;

-- 2. Add workspace_id column to user_roles + team_invites (before creating helper fn)
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;
UPDATE public.user_roles SET workspace_id = '00000000-0000-0000-0000-000000000001' WHERE workspace_id IS NULL;
ALTER TABLE public.user_roles ALTER COLUMN workspace_id SET NOT NULL;

ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_user_id_role_workspace_key UNIQUE (user_id, role, workspace_id);

ALTER TABLE public.team_invites
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;
UPDATE public.team_invites SET workspace_id = '00000000-0000-0000-0000-000000000001' WHERE workspace_id IS NULL;
ALTER TABLE public.team_invites ALTER COLUMN workspace_id SET NOT NULL;

-- 3. current_workspace_id() helper
CREATE OR REPLACE FUNCTION public.current_workspace_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT workspace_id FROM public.user_roles WHERE user_id = auth.uid()
  ORDER BY created_at ASC LIMIT 1;
$$;

ALTER TABLE public.team_invites ALTER COLUMN workspace_id SET DEFAULT public.current_workspace_id();

-- 4. Add workspace_id to all workspace-scoped data tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'buildings','documents','floor_units','invoice_sequences','invoices',
    'properties','property_expenses','property_floors','property_owner_shares',
    'property_owners','reminders','rent_increment_history','rent_increments',
    'rent_payments','tenant_floor_units','tenant_owner_shares','tenants','units'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE', t);
    EXECUTE format('UPDATE public.%I SET workspace_id = %L WHERE workspace_id IS NULL', t, '00000000-0000-0000-0000-000000000001');
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN workspace_id SET NOT NULL', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN workspace_id SET DEFAULT public.current_workspace_id()', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (workspace_id)', t || '_workspace_id_idx', t);
  END LOOP;
END$$;

-- 5. Replace RLS policies on data tables with workspace-scoped versions
DO $$
DECLARE t text; pol record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'buildings','documents','floor_units','invoice_sequences','invoices',
    'properties','property_expenses','property_floors','property_owner_shares',
    'property_owners','reminders','rent_increment_history','rent_increments',
    'rent_payments','tenant_floor_units','tenant_owner_shares','tenants','units'
  ] LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;

    EXECUTE format('CREATE POLICY "ws_select" ON public.%I FOR SELECT TO authenticated USING (workspace_id = public.current_workspace_id())', t);
    EXECUTE format('CREATE POLICY "ws_insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (workspace_id = public.current_workspace_id() AND public.can_edit_team(auth.uid()))', t);
    EXECUTE format('CREATE POLICY "ws_update" ON public.%I FOR UPDATE TO authenticated USING (workspace_id = public.current_workspace_id() AND public.can_edit_team(auth.uid())) WITH CHECK (workspace_id = public.current_workspace_id() AND public.can_edit_team(auth.uid()))', t);
    EXECUTE format('CREATE POLICY "ws_delete" ON public.%I FOR DELETE TO authenticated USING (workspace_id = public.current_workspace_id() AND public.can_edit_team(auth.uid()))', t);
  END LOOP;
END$$;

-- 6. user_roles policies
DROP POLICY IF EXISTS "Authenticated users can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;

CREATE POLICY "View roles in own workspace" ON public.user_roles
  FOR SELECT TO authenticated
  USING (workspace_id = public.current_workspace_id() OR user_id = auth.uid());

CREATE POLICY "Admins can insert roles in workspace" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id = public.current_workspace_id() AND public.is_admin(auth.uid()));

CREATE POLICY "Admins can update roles in workspace" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (workspace_id = public.current_workspace_id() AND public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete roles in workspace" ON public.user_roles
  FOR DELETE TO authenticated
  USING (workspace_id = public.current_workspace_id() AND public.is_admin(auth.uid()) AND user_id <> auth.uid());

-- 7. workspaces RLS policies
DROP POLICY IF EXISTS "Members can view their workspace" ON public.workspaces;
DROP POLICY IF EXISTS "Admins can update their workspace" ON public.workspaces;

CREATE POLICY "Members can view their workspace" ON public.workspaces
  FOR SELECT TO authenticated USING (id = public.current_workspace_id());

CREATE POLICY "Admins can update their workspace" ON public.workspaces
  FOR UPDATE TO authenticated
  USING (id = public.current_workspace_id() AND public.is_admin(auth.uid()));

-- 8. handle_new_user_role: create fresh workspace per self-signup
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  invited_ws uuid;
  new_ws_id uuid;
  display_name text;
BEGIN
  invited_ws := NULLIF(NEW.raw_user_meta_data->>'invited_workspace_id','')::uuid;
  IF invited_ws IS NOT NULL THEN
    RETURN NEW;
  END IF;

  display_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name',''), split_part(NEW.email,'@',1), 'My');

  INSERT INTO public.workspaces (name, created_by)
  VALUES (display_name || '''s Workspace', NEW.id)
  RETURNING id INTO new_ws_id;

  INSERT INTO public.user_roles (user_id, role, workspace_id)
  VALUES (NEW.id, 'admin', new_ws_id);

  RETURN NEW;
END;
$$;

-- 9. handle_admin_user preserves workspace membership
CREATE OR REPLACE FUNCTION public.handle_admin_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.email = 'vrk1995@gmail.com' THEN
    UPDATE public.user_roles SET role='super_admin' WHERE user_id = NEW.id;
    UPDATE public.profiles SET is_approved = true WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- 10. generate_monthly_rent_payments: set workspace_id on new rows
CREATE OR REPLACE FUNCTION public.generate_monthly_rent_payments()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_year INT;
  current_month INT;
  payments_created INT := 0;
  invoices_created INT := 0;
  tenant_record RECORD;
  due_date_calc DATE;
  due_year INT;
  due_month INT;
  payment_status TEXT;
  billing_month_str TEXT;
  new_payment_id UUID;
  invoice_prefix TEXT;
  next_seq INT;
  year_short TEXT;
  inv_number TEXT;
  rent_period TEXT;
BEGIN
  current_year := EXTRACT(YEAR FROM CURRENT_DATE);
  current_month := EXTRACT(MONTH FROM CURRENT_DATE);
  billing_month_str := to_char(CURRENT_DATE, 'YYYY-MM');
  year_short := to_char(CURRENT_DATE, 'YY');

  FOR tenant_record IN
    SELECT
      t.id, t.property_id, t.unit_id, t.monthly_rent,
      LEAST(COALESCE(t.rent_due_day, 1), 28) as rent_due_day,
      COALESCE(t.rent_due_month_offset, 0) as due_offset,
      t.name as tenant_name,
      t.workspace_id as tenant_ws,
      p.name as property_name,
      p.invoice_prefix as prop_invoice_prefix,
      p.owner_id as prop_owner_id
    FROM tenants t
    JOIN properties p ON p.id = t.property_id
    WHERE t.status = 'active' AND COALESCE(t.monthly_rent, 0) > 0
  LOOP
    due_date_calc := (make_date(current_year, current_month, 1)
                      + (tenant_record.due_offset || ' months')::interval)::date;
    due_year := EXTRACT(YEAR FROM due_date_calc)::INT;
    due_month := EXTRACT(MONTH FROM due_date_calc)::INT;
    due_date_calc := make_date(due_year, due_month, tenant_record.rent_due_day);

    IF NOT EXISTS (
      SELECT 1 FROM rent_payments rp
      WHERE rp.tenant_id = tenant_record.id AND rp.billing_month = billing_month_str
    ) THEN
      payment_status := CASE WHEN due_date_calc < CURRENT_DATE THEN 'overdue' ELSE 'pending' END;

      INSERT INTO rent_payments (
        tenant_id, property_id, unit_id, amount, due_date, status, billing_month, workspace_id
      ) VALUES (
        tenant_record.id, tenant_record.property_id, tenant_record.unit_id,
        tenant_record.monthly_rent, due_date_calc, payment_status, billing_month_str,
        tenant_record.tenant_ws
      )
      RETURNING id INTO new_payment_id;

      payments_created := payments_created + 1;

      IF NOT EXISTS (
        SELECT 1 FROM invoices inv
        WHERE inv.tenant_id = tenant_record.id AND inv.property_id = tenant_record.property_id
          AND inv.due_date = due_date_calc AND inv.amount = tenant_record.monthly_rent
      ) THEN
        invoice_prefix := COALESCE(tenant_record.prop_invoice_prefix, UPPER(LEFT(tenant_record.property_name, 3)), 'INV');

        SELECT last_sequence INTO next_seq
        FROM invoice_sequences
        WHERE property_id = tenant_record.property_id AND year = current_year;

        IF next_seq IS NULL THEN
          next_seq := 1;
          INSERT INTO invoice_sequences (property_id, year, last_sequence, workspace_id)
          VALUES (tenant_record.property_id, current_year, 1, tenant_record.tenant_ws);
        ELSE
          next_seq := next_seq + 1;
          UPDATE invoice_sequences SET last_sequence = next_seq, updated_at = now()
          WHERE property_id = tenant_record.property_id AND year = current_year;
        END IF;

        inv_number := 'INV-' || invoice_prefix || '-' || year_short || '-' || LPAD(next_seq::TEXT, 3, '0');
        rent_period := to_char(make_date(current_year, current_month, 1), 'Month YYYY');

        INSERT INTO invoices (
          invoice_number, property_id, tenant_id, amount, due_date, status, created_by, items, workspace_id
        ) VALUES (
          inv_number, tenant_record.property_id, tenant_record.id,
          tenant_record.monthly_rent, due_date_calc, 'sent', tenant_record.prop_owner_id,
          jsonb_build_array(jsonb_build_object('description', 'Rent for ' || TRIM(rent_period), 'amount', tenant_record.monthly_rent)),
          tenant_record.tenant_ws
        );

        invoices_created := invoices_created + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'payments_created', payments_created,
    'invoices_created', invoices_created, 'executed_at', CURRENT_TIMESTAMP);
END;
$function$;

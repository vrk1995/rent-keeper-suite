-- Audit trail: who did what and when, with full before/after values, for tenants,
-- properties, rent_payments, invoices, and payment_transactions. Built at the database
-- level via triggers rather than app-level logging calls, so it catches every write path —
-- the frontend dialogs, the invoice self-heal/freeze logic, the daily cron generator,
-- anything — not just whatever the UI happens to call today.
CREATE TABLE IF NOT EXISTS public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL DEFAULT public.current_workspace_id() REFERENCES public.workspaces(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  changed_by UUID,
  changed_by_name TEXT,
  changes JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_log_entity_idx ON public.activity_log (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_log_workspace_id_idx ON public.activity_log (workspace_id);

GRANT SELECT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- Read-only for everyone in the workspace (property-scoping the log itself would mean
-- duplicating the has_property_access joins per entity_type; not worth it for a log view —
-- anyone who can see the workspace can see who changed what). Only the trigger function
-- (SECURITY DEFINER) writes to this table; there are no INSERT/UPDATE/DELETE policies for
-- authenticated, so direct writes from the app are impossible even if attempted.
DROP POLICY IF EXISTS "ws_select" ON public.activity_log;
CREATE POLICY "ws_select" ON public.activity_log FOR SELECT TO authenticated
  USING (workspace_id = public.current_workspace_id());

-- Generic trigger: logs only the fields that actually changed (skipping bookkeeping columns
-- that always change), so a no-op save doesn't create noise, and a real edit shows exactly
-- what moved from what to what.
CREATE OR REPLACE FUNCTION public.log_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  actor_name text;
  old_data jsonb;
  new_data jsonb;
  diff jsonb := '{}'::jsonb;
  key text;
  ent_id uuid;
  ws_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    old_data := to_jsonb(OLD);
    ent_id := OLD.id;
    ws_id := OLD.workspace_id;
    diff := old_data;
  ELSE
    new_data := to_jsonb(NEW);
    ent_id := NEW.id;
    ws_id := NEW.workspace_id;

    IF TG_OP = 'UPDATE' THEN
      old_data := to_jsonb(OLD);
      FOR key IN SELECT jsonb_object_keys(new_data) LOOP
        IF key NOT IN ('updated_at', 'created_at')
           AND (old_data -> key) IS DISTINCT FROM (new_data -> key) THEN
          diff := diff || jsonb_build_object(key, jsonb_build_object('old', old_data -> key, 'new', new_data -> key));
        END IF;
      END LOOP;
      IF diff = '{}'::jsonb THEN
        RETURN NEW;
      END IF;
    ELSE
      diff := new_data;
    END IF;
  END IF;

  IF actor IS NOT NULL THEN
    SELECT full_name INTO actor_name FROM public.profiles WHERE user_id = actor;
  END IF;

  INSERT INTO public.activity_log (workspace_id, entity_type, entity_id, action, changed_by, changed_by_name, changes)
  VALUES (COALESCE(ws_id, public.current_workspace_id()), TG_TABLE_NAME, ent_id, lower(TG_OP), actor, actor_name, diff);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tenants', 'properties', 'rent_payments', 'invoices', 'payment_transactions'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS log_activity_trigger ON public.%I', t);
    EXECUTE format('CREATE TRIGGER log_activity_trigger AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_activity()', t);
  END LOOP;
END$$;

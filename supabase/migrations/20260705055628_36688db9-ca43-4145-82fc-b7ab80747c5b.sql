
-- 1. workspace_email_domains
CREATE TABLE public.workspace_email_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | verified | failed
  default_from_local_part TEXT DEFAULT 'invoices',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, domain)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_email_domains TO authenticated;
GRANT ALL ON public.workspace_email_domains TO service_role;

ALTER TABLE public.workspace_email_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws_select_domains" ON public.workspace_email_domains
  FOR SELECT TO authenticated
  USING (workspace_id = public.current_workspace_id());
CREATE POLICY "ws_insert_domains" ON public.workspace_email_domains
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id = public.current_workspace_id());
CREATE POLICY "ws_update_domains" ON public.workspace_email_domains
  FOR UPDATE TO authenticated
  USING (workspace_id = public.current_workspace_id());
CREATE POLICY "ws_delete_domains" ON public.workspace_email_domains
  FOR DELETE TO authenticated
  USING (workspace_id = public.current_workspace_id());

CREATE TRIGGER update_workspace_email_domains_updated_at
  BEFORE UPDATE ON public.workspace_email_domains
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. owner_email_senders
CREATE TABLE public.owner_email_senders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.property_owners(id) ON DELETE CASCADE,
  method TEXT NOT NULL DEFAULT 'domain', -- 'domain' | 'gmail'
  from_name TEXT,
  from_email TEXT,
  domain_id UUID REFERENCES public.workspace_email_domains(id) ON DELETE SET NULL,
  gmail_email TEXT,
  gmail_refresh_token_encrypted TEXT,
  reply_to TEXT,
  cc TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(owner_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.owner_email_senders TO authenticated;
GRANT ALL ON public.owner_email_senders TO service_role;

ALTER TABLE public.owner_email_senders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws_select_owner_senders" ON public.owner_email_senders
  FOR SELECT TO authenticated
  USING (workspace_id = public.current_workspace_id());
CREATE POLICY "ws_insert_owner_senders" ON public.owner_email_senders
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id = public.current_workspace_id());
CREATE POLICY "ws_update_owner_senders" ON public.owner_email_senders
  FOR UPDATE TO authenticated
  USING (workspace_id = public.current_workspace_id());
CREATE POLICY "ws_delete_owner_senders" ON public.owner_email_senders
  FOR DELETE TO authenticated
  USING (workspace_id = public.current_workspace_id());

CREATE TRIGGER update_owner_email_senders_updated_at
  BEFORE UPDATE ON public.owner_email_senders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. invoice_email_log
CREATE TABLE public.invoice_email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  to_email TEXT,
  from_email TEXT,
  method TEXT, -- 'domain' | 'gmail'
  status TEXT NOT NULL, -- 'sent' | 'failed' | 'skipped'
  reason TEXT,
  error TEXT,
  provider_message_id TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoice_email_log_invoice ON public.invoice_email_log(invoice_id);

GRANT SELECT ON public.invoice_email_log TO authenticated;
GRANT ALL ON public.invoice_email_log TO service_role;

ALTER TABLE public.invoice_email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws_select_email_log" ON public.invoice_email_log
  FOR SELECT TO authenticated
  USING (workspace_id = public.current_workspace_id());

-- 4. default sender on workspaces
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS default_owner_id UUID REFERENCES public.property_owners(id) ON DELETE SET NULL;

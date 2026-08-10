CREATE TABLE public.invoice_generation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  rent_payment_id uuid REFERENCES public.rent_payments(id) ON DELETE SET NULL,
  invoice_number text,
  invoice_date date,
  source text NOT NULL CHECK (source IN ('cron','preview','manual')),
  outcome text NOT NULL CHECK (outcome IN ('created','reused','blocked','failed')),
  reason text,
  triggered_by uuid,
  triggered_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.invoice_generation_log TO authenticated;
GRANT ALL ON public.invoice_generation_log TO service_role;

ALTER TABLE public.invoice_generation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view invoice generation log"
ON public.invoice_generation_log FOR SELECT TO authenticated
USING (workspace_id = public.current_workspace_id() AND public.is_team_member(auth.uid()));

CREATE INDEX idx_invoice_generation_log_invoice ON public.invoice_generation_log(invoice_id);
CREATE INDEX idx_invoice_generation_log_payment ON public.invoice_generation_log(rent_payment_id);
CREATE INDEX idx_invoice_generation_log_ws_created ON public.invoice_generation_log(workspace_id, created_at DESC);
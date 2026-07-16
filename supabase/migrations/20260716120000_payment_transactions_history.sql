-- Partial payments currently overwrite a single paid_amount/paid_date/payment_method on
-- rent_payments, so the history of each individual installment (when the 1st was received,
-- the 2nd, etc.) is lost. Add a ledger table with one row per actual payment received, so
-- every installment against a month's rent is kept and can be shown on receipts/statements.
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rent_payment_id UUID NOT NULL REFERENCES public.rent_payments(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,              -- gross rent settled in this installment (before TDS)
  tds_amount NUMERIC NOT NULL DEFAULT 0,
  received_amount NUMERIC NOT NULL,     -- net cash actually received (amount - tds_amount)
  paid_date DATE NOT NULL,
  payment_method TEXT,
  notes TEXT,
  workspace_id UUID NOT NULL DEFAULT public.current_workspace_id() REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_transactions_rent_payment_id_idx
  ON public.payment_transactions (rent_payment_id);
CREATE INDEX IF NOT EXISTS payment_transactions_workspace_id_idx
  ON public.payment_transactions (workspace_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_transactions TO authenticated;
GRANT ALL ON public.payment_transactions TO service_role;

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

-- Mirror rent_payments' own policy set: any team member in the workspace can view; members
-- (and up) can record/edit installments; deleting an installment stays admin-only.
CREATE POLICY "ws_select" ON public.payment_transactions FOR SELECT TO authenticated
  USING (workspace_id = public.current_workspace_id());

CREATE POLICY "ws_insert" ON public.payment_transactions FOR INSERT TO authenticated
  WITH CHECK (workspace_id = public.current_workspace_id() AND public.can_record_payments(auth.uid()));

CREATE POLICY "ws_update" ON public.payment_transactions FOR UPDATE TO authenticated
  USING (workspace_id = public.current_workspace_id() AND public.can_record_payments(auth.uid()))
  WITH CHECK (workspace_id = public.current_workspace_id() AND public.can_record_payments(auth.uid()));

CREATE POLICY "ws_delete" ON public.payment_transactions FOR DELETE TO authenticated
  USING (workspace_id = public.current_workspace_id() AND public.can_edit_team(auth.uid()));

-- Backfill: every rent_payment that already has money recorded against it becomes one
-- historical installment, so no existing payment data is lost. tds_amount here is whatever
-- was last stored on the payment (the old model only kept the latest); received = amount - tds.
INSERT INTO public.payment_transactions (
  rent_payment_id, amount, tds_amount, received_amount, paid_date, payment_method, notes, workspace_id, created_by, created_at
)
SELECT
  rp.id,
  rp.paid_amount,
  COALESCE(rp.tds_amount, 0),
  rp.paid_amount - COALESCE(rp.tds_amount, 0),
  COALESCE(rp.paid_date, rp.due_date),
  rp.payment_method,
  rp.notes,
  rp.workspace_id,
  rp.marked_by,
  COALESCE(rp.updated_at, now())
FROM public.rent_payments rp
WHERE COALESCE(rp.paid_amount, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.payment_transactions pt WHERE pt.rent_payment_id = rp.id
  );

-- Multiple supporting documents per expense (contracts, warranty cards, extra invoices,
-- correspondence — distinct from the single "scanned bill" receipt_url already on the row),
-- visible to everyone with access to the property (i.e. the whole workspace, in the common
-- case where nobody has been scoped to specific properties).

-- 1. Bug fix: property_expenses' insert/update policies were relaxed to let members add and
--    edit their own expenses, but the expense-receipts storage bucket's policies (from the
--    earlier receipt-attachment feature) were never updated to match — they still gate on
--    can_edit_team (admin tier), so a member attaching or replacing a receipt on their own
--    new expense would have the storage write silently rejected. Bring these in line with
--    can_add_expenses, same tier as who can create/attach a receipt on the row itself.
DROP POLICY IF EXISTS "expense_receipts_insert" ON storage.objects;
CREATE POLICY "expense_receipts_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'expense-receipts'
    AND public.can_add_expenses(auth.uid())
    AND public.has_property_access(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

DROP POLICY IF EXISTS "expense_receipts_delete" ON storage.objects;
CREATE POLICY "expense_receipts_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND public.can_add_expenses(auth.uid())
    AND public.has_property_access(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

-- 2. One row per uploaded document. property_id is denormalized from the parent expense so
--    RLS can check has_property_access() directly, matching every other property-scoped
--    table in this app, without a join.
CREATE TABLE IF NOT EXISTS public.expense_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES public.property_expenses(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL DEFAULT public.current_workspace_id() REFERENCES public.workspaces(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT,
  content_type TEXT,
  uploaded_by UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expense_documents_expense_id_idx ON public.expense_documents (expense_id);
CREATE INDEX IF NOT EXISTS expense_documents_workspace_id_idx ON public.expense_documents (workspace_id);

GRANT SELECT, INSERT, DELETE ON public.expense_documents TO authenticated;
GRANT ALL ON public.expense_documents TO service_role;

ALTER TABLE public.expense_documents ENABLE ROW LEVEL SECURITY;

-- Visible to anyone with access to the property (the whole workspace, unless someone has
-- been explicitly scoped) — files are immutable once uploaded (delete + re-upload instead
-- of editing), matching the existing property-level Documents tab. Deleting is admin-tier
-- only, also matching that precedent, rather than trying to replicate "only the uploader"
-- at this layer.
CREATE POLICY "ws_select" ON public.expense_documents FOR SELECT TO authenticated
  USING (workspace_id = public.current_workspace_id() AND public.has_property_access(auth.uid(), property_id));
CREATE POLICY "ws_insert" ON public.expense_documents FOR INSERT TO authenticated
  WITH CHECK (workspace_id = public.current_workspace_id() AND public.can_add_expenses(auth.uid()) AND public.has_property_access(auth.uid(), property_id));
CREATE POLICY "ws_delete" ON public.expense_documents FOR DELETE TO authenticated
  USING (workspace_id = public.current_workspace_id() AND public.can_edit_team(auth.uid()) AND public.has_property_access(auth.uid(), property_id));

DROP TRIGGER IF EXISTS log_activity_trigger ON public.expense_documents;
CREATE TRIGGER log_activity_trigger AFTER INSERT OR UPDATE OR DELETE ON public.expense_documents
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

-- 3. Dedicated private bucket (kept separate from expense-receipts so this table's
--    admin-only delete policy can't be undermined by a more permissive storage-level
--    delete needed for the receipt-replace flow). Files live at {property_id}/{expense_id}/
--    {filename}; RLS only ever looks at the first path segment.
INSERT INTO storage.buckets (id, name, public)
VALUES ('expense-documents', 'expense-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "expense_documents_select" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'expense-documents'
    AND public.has_property_access(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "expense_documents_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'expense-documents'
    AND public.can_add_expenses(auth.uid())
    AND public.has_property_access(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "expense_documents_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'expense-documents'
    AND public.can_edit_team(auth.uid())
    AND public.has_property_access(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

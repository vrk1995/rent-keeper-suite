-- Storage for scanned/photographed expense bills, one per property_expenses row (receipt_url
-- column already exists — it just had no UI to fill it in). A dedicated bucket rather than
-- reusing the existing "documents" bucket: that bucket's storage policies predate the
-- workspace/team access model (they only ever let the original uploader see their own
-- upload — auth.uid() = first path segment), so any other team member with access to the
-- property would be unable to view a colleague's receipt. Kept private and scoped by
-- property access, matching property_expenses' own row-level policies exactly.
--
-- Files are stored at {property_id}/{filename}. receipt_url stores that STORAGE PATH, not a
-- public URL — the bucket is private, so viewing goes through a short-lived signed URL
-- generated on demand (see getExpenseReceiptViewUrl in src/hooks/useExpenses.ts).
INSERT INTO storage.buckets (id, name, public)
VALUES ('expense-receipts', 'expense-receipts', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "expense_receipts_select" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND public.has_property_access(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "expense_receipts_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'expense-receipts'
    AND public.can_edit_team(auth.uid())
    AND public.has_property_access(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "expense_receipts_update" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND public.can_edit_team(auth.uid())
    AND public.has_property_access(auth.uid(), (storage.foldername(name))[1]::uuid)
  )
  WITH CHECK (
    bucket_id = 'expense-receipts'
    AND public.can_edit_team(auth.uid())
    AND public.has_property_access(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "expense_receipts_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND public.can_edit_team(auth.uid())
    AND public.has_property_access(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

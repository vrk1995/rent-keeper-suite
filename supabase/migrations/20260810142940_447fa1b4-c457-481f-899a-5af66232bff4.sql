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
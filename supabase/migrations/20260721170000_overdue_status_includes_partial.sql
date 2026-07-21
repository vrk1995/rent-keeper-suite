-- update_overdue_payments() only ever looked at status = 'pending', so a payment that had
-- already received a partial installment stayed labelled 'partial' forever, even long after
-- its due date passed with a balance still outstanding. Partially-paid installments are just
-- as overdue as untouched ones once their due date lapses — the remaining-amount math already
-- reads amount - paid_amount everywhere overdue is displayed, so widening this WHERE clause is
-- enough to make partial payments correctly flip to 'overdue' for their unpaid remainder.
CREATE OR REPLACE FUNCTION public.update_overdue_payments()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count INT;
BEGIN
  UPDATE rent_payments
  SET status = 'overdue', updated_at = NOW()
  WHERE status IN ('pending', 'partial')
    AND due_date < CURRENT_DATE;

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'payments_marked_overdue', updated_count,
    'executed_at', CURRENT_TIMESTAMP
  );
END;
$$;

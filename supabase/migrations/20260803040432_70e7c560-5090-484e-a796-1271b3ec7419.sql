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
  tenant_record RECORD;
  invoice_date_calc DATE;
  due_date_calc DATE;
  inv_year INT;
  inv_month INT;
  payment_status TEXT;
  billing_month_str TEXT;
BEGIN
  current_year := EXTRACT(YEAR FROM CURRENT_DATE);
  current_month := EXTRACT(MONTH FROM CURRENT_DATE);
  billing_month_str := to_char(CURRENT_DATE, 'YYYY-MM');

  FOR tenant_record IN
    SELECT
      t.id, t.property_id, t.unit_id, t.monthly_rent,
      LEAST(COALESCE(t.rent_due_day, 1), 28) as rent_due_day,
      COALESCE(t.rent_due_month_offset, 0) as due_offset,
      COALESCE(t.due_days_after_invoice, 0) as grace_days,
      COALESCE(t.workspace_id, p.workspace_id) as tenant_ws
    FROM tenants t
    JOIN properties p ON p.id = t.property_id
    WHERE t.status = 'active' AND COALESCE(t.monthly_rent, 0) > 0
  LOOP
    -- Invoice date = tenant's billing day in (billing month + offset)
    invoice_date_calc := (make_date(current_year, current_month, 1)
                      + (tenant_record.due_offset || ' months')::interval)::date;
    inv_year := EXTRACT(YEAR FROM invoice_date_calc)::INT;
    inv_month := EXTRACT(MONTH FROM invoice_date_calc)::INT;
    invoice_date_calc := make_date(inv_year, inv_month, tenant_record.rent_due_day);
    -- Due date = invoice date + the tenant's configured grace period
    due_date_calc := invoice_date_calc + tenant_record.grace_days;

    IF NOT EXISTS (
      SELECT 1 FROM rent_payments rp
      WHERE rp.tenant_id = tenant_record.id AND rp.billing_month = billing_month_str
    ) THEN
      payment_status := CASE WHEN due_date_calc < CURRENT_DATE THEN 'overdue' ELSE 'pending' END;

      INSERT INTO rent_payments (
        tenant_id, property_id, unit_id, amount, due_date, invoice_date, status, billing_month, workspace_id
      ) VALUES (
        tenant_record.id, tenant_record.property_id, tenant_record.unit_id,
        tenant_record.monthly_rent, due_date_calc, invoice_date_calc, payment_status, billing_month_str,
        tenant_record.tenant_ws
      );

      payments_created := payments_created + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'payments_created', payments_created,
    'invoices_created', 0, 'executed_at', CURRENT_TIMESTAMP);
END;
$function$;
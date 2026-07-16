
-- 1) Update generator: always create invoice alongside the payment
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
    END IF;

    -- Always generate invoice at creation time (no date gate) so invoice numbers exist immediately
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
  END LOOP;

  RETURN jsonb_build_object('success', true, 'payments_created', payments_created,
    'invoices_created', invoices_created, 'executed_at', CURRENT_TIMESTAMP);
END;
$function$;

-- 2) Backfill: create invoices for existing rent_payments that have none
DO $$
DECLARE
  rp_rec RECORD;
  invoice_prefix TEXT;
  next_seq INT;
  year_short TEXT;
  inv_number TEXT;
  rent_period TEXT;
  yr INT;
  mo INT;
BEGIN
  FOR rp_rec IN
    SELECT rp.id, rp.tenant_id, rp.property_id, rp.amount, rp.due_date, rp.workspace_id,
           p.name AS property_name, p.invoice_prefix AS prop_invoice_prefix, p.owner_id AS prop_owner_id,
           p.workspace_id AS prop_ws
    FROM rent_payments rp
    JOIN properties p ON p.id = rp.property_id
    LEFT JOIN invoices i
      ON i.tenant_id = rp.tenant_id AND i.property_id = rp.property_id
     AND i.due_date = rp.due_date AND i.amount = rp.amount
    WHERE i.id IS NULL
    ORDER BY rp.due_date ASC, rp.created_at ASC
  LOOP
    yr := EXTRACT(YEAR FROM rp_rec.due_date)::INT;
    mo := EXTRACT(MONTH FROM rp_rec.due_date)::INT;
    year_short := to_char(rp_rec.due_date, 'YY');
    invoice_prefix := COALESCE(rp_rec.prop_invoice_prefix, UPPER(LEFT(rp_rec.property_name, 3)), 'INV');

    SELECT last_sequence INTO next_seq
    FROM invoice_sequences
    WHERE property_id = rp_rec.property_id AND year = yr;

    IF next_seq IS NULL THEN
      next_seq := 1;
      INSERT INTO invoice_sequences (property_id, year, last_sequence, workspace_id)
      VALUES (rp_rec.property_id, yr, 1, COALESCE(rp_rec.workspace_id, rp_rec.prop_ws));
    ELSE
      next_seq := next_seq + 1;
      UPDATE invoice_sequences SET last_sequence = next_seq, updated_at = now()
      WHERE property_id = rp_rec.property_id AND year = yr;
    END IF;

    inv_number := 'INV-' || invoice_prefix || '-' || year_short || '-' || LPAD(next_seq::TEXT, 3, '0');
    rent_period := to_char(make_date(yr, mo, 1), 'Month YYYY');

    INSERT INTO invoices (
      invoice_number, property_id, tenant_id, amount, due_date, status, created_by, items, workspace_id
    ) VALUES (
      inv_number, rp_rec.property_id, rp_rec.tenant_id,
      rp_rec.amount, rp_rec.due_date, 'sent', rp_rec.prop_owner_id,
      jsonb_build_array(jsonb_build_object('description', 'Rent for ' || TRIM(rent_period), 'amount', rp_rec.amount)),
      COALESCE(rp_rec.workspace_id, rp_rec.prop_ws)
    );
  END LOOP;
END $$;

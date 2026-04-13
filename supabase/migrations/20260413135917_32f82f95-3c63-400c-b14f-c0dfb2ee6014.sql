
CREATE OR REPLACE FUNCTION public.generate_monthly_rent_payments()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_year INT;
  current_month INT;
  month_start DATE;
  month_end DATE;
  payments_created INT := 0;
  invoices_created INT := 0;
  tenant_record RECORD;
  due_date_calc DATE;
  payment_status TEXT;
  billing_month_str TEXT;
  new_payment_id UUID;
  invoice_prefix TEXT;
  next_seq INT;
  year_short TEXT;
  inv_number TEXT;
  rent_period TEXT;
  prop_owner_id UUID;
BEGIN
  current_year := EXTRACT(YEAR FROM CURRENT_DATE);
  current_month := EXTRACT(MONTH FROM CURRENT_DATE);
  month_start := DATE_TRUNC('month', CURRENT_DATE)::DATE;
  month_end := (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE;
  billing_month_str := to_char(CURRENT_DATE, 'YYYY-MM');
  year_short := to_char(CURRENT_DATE, 'YY');

  FOR tenant_record IN 
    SELECT 
      t.id,
      t.property_id,
      t.unit_id,
      t.monthly_rent,
      LEAST(COALESCE(t.rent_due_day, 1), 28) as rent_due_day,
      t.name as tenant_name,
      p.name as property_name,
      p.invoice_prefix as prop_invoice_prefix,
      p.owner_id as prop_owner_id
    FROM tenants t
    JOIN properties p ON p.id = t.property_id
    WHERE t.status = 'active'
      AND COALESCE(t.monthly_rent, 0) > 0
  LOOP
    due_date_calc := make_date(current_year, current_month, tenant_record.rent_due_day);
    
    IF NOT EXISTS (
      SELECT 1 FROM rent_payments rp
      WHERE rp.tenant_id = tenant_record.id
        AND rp.billing_month = billing_month_str
    ) THEN
      IF due_date_calc < CURRENT_DATE THEN
        payment_status := 'overdue';
      ELSE
        payment_status := 'pending';
      END IF;
      
      INSERT INTO rent_payments (
        tenant_id,
        property_id,
        unit_id,
        amount,
        due_date,
        status,
        billing_month
      ) VALUES (
        tenant_record.id,
        tenant_record.property_id,
        tenant_record.unit_id,
        tenant_record.monthly_rent,
        due_date_calc,
        payment_status,
        billing_month_str
      )
      RETURNING id INTO new_payment_id;
      
      payments_created := payments_created + 1;

      -- Auto-create invoice for this payment
      IF NOT EXISTS (
        SELECT 1 FROM invoices inv
        WHERE inv.tenant_id = tenant_record.id
          AND inv.property_id = tenant_record.property_id
          AND inv.due_date = due_date_calc
          AND inv.amount = tenant_record.monthly_rent
      ) THEN
        -- Get or create invoice sequence
        invoice_prefix := COALESCE(tenant_record.prop_invoice_prefix, UPPER(LEFT(tenant_record.property_name, 3)), 'INV');

        SELECT last_sequence INTO next_seq
        FROM invoice_sequences
        WHERE property_id = tenant_record.property_id AND year = current_year;

        IF next_seq IS NULL THEN
          next_seq := 1;
          INSERT INTO invoice_sequences (property_id, year, last_sequence)
          VALUES (tenant_record.property_id, current_year, 1);
        ELSE
          next_seq := next_seq + 1;
          UPDATE invoice_sequences
          SET last_sequence = next_seq, updated_at = now()
          WHERE property_id = tenant_record.property_id AND year = current_year;
        END IF;

        inv_number := 'INV-' || invoice_prefix || '-' || year_short || '-' || LPAD(next_seq::TEXT, 3, '0');
        rent_period := to_char(make_date(current_year, current_month, 1), 'Month YYYY');

        INSERT INTO invoices (
          invoice_number,
          property_id,
          tenant_id,
          amount,
          due_date,
          status,
          created_by,
          items
        ) VALUES (
          inv_number,
          tenant_record.property_id,
          tenant_record.id,
          tenant_record.monthly_rent,
          due_date_calc,
          'sent',
          tenant_record.prop_owner_id,
          jsonb_build_array(jsonb_build_object('description', 'Rent for ' || TRIM(rent_period), 'amount', tenant_record.monthly_rent))
        );

        invoices_created := invoices_created + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'payments_created', payments_created,
    'invoices_created', invoices_created,
    'executed_at', CURRENT_TIMESTAMP
  );
END;
$function$;

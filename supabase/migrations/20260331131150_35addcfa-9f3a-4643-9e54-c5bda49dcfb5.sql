
-- Add billing_month column to track which month the rent is for (format: YYYY-MM)
ALTER TABLE public.rent_payments ADD COLUMN billing_month text;

-- Backfill existing records: derive billing_month from due_date
UPDATE public.rent_payments 
SET billing_month = to_char(due_date, 'YYYY-MM')
WHERE billing_month IS NULL;

-- Update the generate_monthly_rent_payments function to include billing_month
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
  tenant_record RECORD;
  due_date_calc DATE;
  payment_status TEXT;
  billing_month_str TEXT;
BEGIN
  current_year := EXTRACT(YEAR FROM CURRENT_DATE);
  current_month := EXTRACT(MONTH FROM CURRENT_DATE);
  month_start := DATE_TRUNC('month', CURRENT_DATE)::DATE;
  month_end := (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE;
  billing_month_str := to_char(CURRENT_DATE, 'YYYY-MM');

  FOR tenant_record IN 
    SELECT 
      t.id,
      t.property_id,
      t.unit_id,
      t.monthly_rent,
      LEAST(COALESCE(t.rent_due_day, 1), 28) as rent_due_day
    FROM tenants t
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
      );
      
      payments_created := payments_created + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'payments_created', payments_created,
    'executed_at', CURRENT_TIMESTAMP
  );
END;
$function$;

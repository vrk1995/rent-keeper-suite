-- Enable required extensions for scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create a function to auto-generate monthly rent payments
CREATE OR REPLACE FUNCTION public.generate_monthly_rent_payments()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_year INT;
  current_month INT;
  month_start DATE;
  month_end DATE;
  payments_created INT := 0;
  tenant_record RECORD;
  due_date_calc DATE;
  payment_status TEXT;
BEGIN
  -- Get current month info
  current_year := EXTRACT(YEAR FROM CURRENT_DATE);
  current_month := EXTRACT(MONTH FROM CURRENT_DATE);
  month_start := DATE_TRUNC('month', CURRENT_DATE)::DATE;
  month_end := (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE;

  -- Loop through active tenants
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
    -- Calculate due date for this month
    due_date_calc := make_date(current_year, current_month, tenant_record.rent_due_day);
    
    -- Check if payment already exists for this tenant this month
    IF NOT EXISTS (
      SELECT 1 FROM rent_payments rp
      WHERE rp.tenant_id = tenant_record.id
        AND rp.due_date >= month_start
        AND rp.due_date <= month_end
    ) THEN
      -- Determine status based on current date
      IF due_date_calc < CURRENT_DATE THEN
        payment_status := 'overdue';
      ELSE
        payment_status := 'pending';
      END IF;
      
      -- Insert new payment record
      INSERT INTO rent_payments (
        tenant_id,
        property_id,
        unit_id,
        amount,
        due_date,
        status
      ) VALUES (
        tenant_record.id,
        tenant_record.property_id,
        tenant_record.unit_id,
        tenant_record.monthly_rent,
        due_date_calc,
        payment_status
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
$$;

-- Create a function to update overdue payments status
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
  WHERE status = 'pending'
    AND due_date < CURRENT_DATE;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'payments_marked_overdue', updated_count,
    'executed_at', CURRENT_TIMESTAMP
  );
END;
$$;

-- Combined function that does both operations
CREATE OR REPLACE FUNCTION public.daily_payment_processing()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  generation_result jsonb;
  overdue_result jsonb;
BEGIN
  -- First generate new payments
  generation_result := generate_monthly_rent_payments();
  
  -- Then update overdue status
  overdue_result := update_overdue_payments();
  
  RETURN jsonb_build_object(
    'success', true,
    'generation', generation_result,
    'overdue_update', overdue_result,
    'executed_at', CURRENT_TIMESTAMP
  );
END;
$$;
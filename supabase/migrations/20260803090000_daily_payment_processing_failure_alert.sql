-- daily_payment_processing() is the only cron job that isn't an edge function — it's a plain
-- SQL function, so if generate_monthly_rent_payments()/update_overdue_payments() ever throws
-- (e.g. bad tenant data), pg_cron just marks the run failed with zero application-level
-- visibility: no email, no reminder, nothing in the app itself. The two edge-function crons
-- (generate-daily-invoices, apply-due-rent-increments) already email vrk1995@gmail.com via the
-- cron-failure-alert template when they fail; this brings the same alerting here by catching
-- the exception, firing the same alert over HTTP, then re-raising so the run still shows failed
-- in cron.job_run_details exactly as before.
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
  generation_result := generate_monthly_rent_payments();
  overdue_result := update_overdue_payments();

  RETURN jsonb_build_object(
    'success', true,
    'generation', generation_result,
    'overdue_update', overdue_result,
    'executed_at', CURRENT_TIMESTAMP
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM net.http_post(
    url := 'https://lqwsnhjavgdrfuzgdywy.supabase.co/functions/v1/send-transactional-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer PROJECT_ANON_PUBLISHABLE_KEY',
      'apikey', 'PROJECT_ANON_PUBLISHABLE_KEY'
    ),
    body := jsonb_build_object(
      'templateName', 'cron-failure-alert',
      'idempotencyKey', 'cron-failure-daily_payment_processing-' || to_char(now(), 'YYYY-MM-DD-HH24'),
      'templateData', jsonb_build_object(
        'cronName', 'Daily Payment Processing',
        'ranAt', now(),
        'topLevelError', SQLERRM
      )
    )
  );
  RAISE;
END;
$$;

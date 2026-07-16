-- Automatically generate each tenant's invoice on their invoice date at 8:00 AM IST, as a
-- complement to (not a replacement for) the manual "Generate Payments" button. India has no
-- daylight savings, so 8:00 AM IST is always exactly 2:30 AM UTC.
--
-- generate-daily-invoices has verify_jwt = false (see supabase/config.toml), so the platform
-- doesn't gate the request on a valid JWT at all — the function's own DB privileges come from
-- its internal Deno.env SUPABASE_SERVICE_ROLE_KEY client, independent of whatever token this
-- job sends. That means the publishable/anon key (already public, embedded in the frontend
-- bundle) is fine to use here — no service-role secret needs to be stored for this job.
CREATE EXTENSION IF NOT EXISTS pg_net;

select cron.schedule(
  'daily-invoice-generation',
  '30 2 * * *',
  $$
  select net.http_post(
    url := 'https://lqwsnhjavgdrfuzgdywy.supabase.co/functions/v1/generate-daily-invoices',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer PROJECT_ANON_PUBLISHABLE_KEY',
      'apikey', 'PROJECT_ANON_PUBLISHABLE_KEY'
    ),
    body := '{}'::jsonb
  );
  $$
);

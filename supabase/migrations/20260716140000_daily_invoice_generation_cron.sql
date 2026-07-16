-- Automatically generate each tenant's invoice on their invoice date at 8:00 AM IST, as a
-- complement to (not a replacement for) the manual "Generate Payments" button. India has no
-- daylight savings, so 8:00 AM IST is always exactly 2:30 AM UTC.
CREATE EXTENSION IF NOT EXISTS pg_net;

-- The cron job below calls the generate-daily-invoices edge function over HTTP and needs the
-- service role key to authenticate. That key must never be stored in plaintext in a migration
-- file (committed to git) or directly in the cron job's SQL (visible to anyone who can read
-- cron.job). Store it in Supabase Vault first by running this ONE TIME in the SQL editor,
-- with your actual service role key substituted in (Project Settings -> API -> service_role):
--
--   select vault.create_secret('PASTE_YOUR_SERVICE_ROLE_KEY_HERE', 'generate_invoices_service_key');
--
-- Then run the schedule below, which references that secret by name only.
select cron.schedule(
  'daily-invoice-generation',
  '30 2 * * *',
  $$
  select net.http_post(
    url := 'https://lqwsnhjavgdrfuzgdywy.supabase.co/functions/v1/generate-daily-invoices',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'generate_invoices_service_key'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);

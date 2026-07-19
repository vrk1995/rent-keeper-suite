-- Rent increments become automatic instead of requiring a manual "Apply Increment Now"
-- click, and gain a one-time (non-repeating) mode alongside the existing recurring one.

-- 1) One-time vs recurring. interval_months only makes sense for recurring rules.
ALTER TABLE public.rent_increments ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.rent_increments ALTER COLUMN interval_months DROP NOT NULL;

-- 2) Let the Reminders table carry an automatically-generated "rent increased" notice
-- alongside the existing user-authored reminder types.
ALTER TABLE public.reminders DROP CONSTRAINT IF EXISTS reminders_reminder_type_check;
ALTER TABLE public.reminders ADD CONSTRAINT reminders_reminder_type_check
  CHECK (reminder_type IN ('rent_due', 'lease_renewal', 'maintenance', 'custom', 'rent_increment'));

-- 3) Daily cron: apply any rent increment whose date has arrived, ahead of the daily invoice
-- generation cron (2:30 AM UTC = 8:00 AM IST) so a same-day increase is reflected before
-- that day's invoices are generated. generate-daily-invoices additionally resolves the
-- correct historical rent for whichever billing period it's invoicing, so ordering between
-- these two jobs doesn't actually affect correctness — this is just for intuitive sequencing.
CREATE EXTENSION IF NOT EXISTS pg_net;

select cron.schedule(
  'apply-due-rent-increments',
  '15 2 * * *',
  $$
  select net.http_post(
    url := 'https://lqwsnhjavgdrfuzgdywy.supabase.co/functions/v1/apply-due-rent-increments',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'PROJECT_ANON_PUBLISHABLE_KEY'
    ),
    body := '{}'::jsonb
  );
  $$
);

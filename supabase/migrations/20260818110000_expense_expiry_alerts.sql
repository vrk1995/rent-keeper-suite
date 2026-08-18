-- Expense period-expiry tracking: insurance, tax, AMC contracts etc. with a coverage
-- period get automatic email + in-app alerts as their period_to approaches, and keep
-- getting nagged periodically if left unresolved after it lapses.

-- 1. Track which pre-expiry thresholds have already been notified for the CURRENT period,
--    so the daily cron can re-run safely without re-notifying. Changing period_to (renewing
--    the policy/contract) naturally restarts the alert cycle for the new period.
ALTER TABLE public.property_expenses
  ADD COLUMN IF NOT EXISTS expiry_alerts_sent text[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.reset_expense_expiry_alerts()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.period_to IS DISTINCT FROM OLD.period_to THEN
    NEW.expiry_alerts_sent := '{}';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reset_expense_expiry_alerts_trigger ON public.property_expenses;
CREATE TRIGGER reset_expense_expiry_alerts_trigger
  BEFORE UPDATE ON public.property_expenses
  FOR EACH ROW EXECUTE FUNCTION public.reset_expense_expiry_alerts();

-- 2. Let the in-app Reminders list carry auto-generated expiry notices (mirrors how
--    apply-due-rent-increments already auto-creates 'rent_increment' reminders), linked
--    back to the expense they're about so a deleted expense doesn't leave orphaned rows.
ALTER TABLE public.reminders DROP CONSTRAINT IF EXISTS reminders_reminder_type_check;
ALTER TABLE public.reminders ADD CONSTRAINT reminders_reminder_type_check
  CHECK (reminder_type IN ('rent_due', 'lease_renewal', 'maintenance', 'custom', 'rent_increment', 'expense_expiry'));

ALTER TABLE public.reminders
  ADD COLUMN IF NOT EXISTS expense_id UUID REFERENCES public.property_expenses(id) ON DELETE CASCADE;

-- 3. Daily cron: check every expense with a coverage period for approaching/lapsed expiry.
--    Runs after the payment-reminders digest (9:00 AM IST) at 9:15 AM IST = 3:45 AM UTC.
CREATE EXTENSION IF NOT EXISTS pg_net;

select cron.schedule(
  'check-expense-expiries',
  '45 3 * * *',
  $$
  select net.http_post(
    url := 'https://lqwsnhjavgdrfuzgdywy.supabase.co/functions/v1/check-expense-expiries',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'PROJECT_ANON_PUBLISHABLE_KEY'
    ),
    body := '{}'::jsonb
  );
  $$
);

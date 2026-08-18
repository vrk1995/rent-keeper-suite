-- Optional coverage period for expenses that span a stretch of time (insurance, tax,
-- AMC contracts, etc.) rather than a single date — e.g. "1 Apr 2020 to 31 Mar 2021".
-- Tenure itself isn't stored: it's purely a data-entry convenience computed client-side
-- from these two dates, so there's nothing to keep in sync if someone edits a date directly.
ALTER TABLE public.property_expenses
  ADD COLUMN IF NOT EXISTS period_from date,
  ADD COLUMN IF NOT EXISTS period_to date;

ALTER TABLE public.property_expenses
  DROP CONSTRAINT IF EXISTS property_expenses_period_check;
ALTER TABLE public.property_expenses
  ADD CONSTRAINT property_expenses_period_check
  CHECK (period_from IS NULL OR period_to IS NULL OR period_to >= period_from);

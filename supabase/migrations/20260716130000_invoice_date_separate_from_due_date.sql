-- Invoice date and due date were always the same value: the invoice PDF's "ISSUED" date
-- fell back to due_date whenever paid_date wasn't set (i.e. for almost every invoice, since
-- most are generated before payment). Tenants can now have their own invoice date rule,
-- independent of when payment is actually due.
--
-- The existing rent_due_day/rent_due_month_offset day-of-month + month-offset rule becomes
-- the INVOICE date rule. A new due_days_after_invoice field (default 0) says how many days
-- after the invoice date payment is due — 0 means unchanged behavior (due date == invoice date).
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS due_days_after_invoice INTEGER NOT NULL DEFAULT 0;

-- Each rent_payment now stores its own invoice_date (computed alongside due_date when the
-- payment is generated). Existing rows predate this column, so backfill them to their
-- current due_date — i.e. no visible change for anything already generated.
ALTER TABLE public.rent_payments
  ADD COLUMN IF NOT EXISTS invoice_date DATE;

UPDATE public.rent_payments
SET invoice_date = due_date
WHERE invoice_date IS NULL;

-- Invoices freeze their invoice_date at creation time, same as the other billing-snapshot
-- fields, so it never drifts if the payment's dates are edited later. Backfill existing
-- invoices to their current due_date for the same reason as above.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS invoice_date DATE;

UPDATE public.invoices
SET invoice_date = due_date
WHERE invoice_date IS NULL;

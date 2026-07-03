-- Tenant-level default: does this tenant typically deduct TDS from rent?
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS tds_applicable BOOLEAN NOT NULL DEFAULT false;

-- Per-payment record of whether TDS was actually deducted, and how much
ALTER TABLE public.rent_payments
  ADD COLUMN IF NOT EXISTS tds_applicable BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tds_amount NUMERIC NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.tenants.tds_applicable IS
  'Default shown when recording a payment for this tenant; the actual per-payment flag lives on rent_payments.tds_applicable.';
COMMENT ON COLUMN public.rent_payments.tds_amount IS
  'Amount withheld as TDS for this payment (10% of rent due when tds_applicable is true). Counts toward the rent being fully settled even though it was not received in cash.';

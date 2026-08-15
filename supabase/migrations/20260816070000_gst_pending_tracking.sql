-- Tracks GST that's known to still be owed for a billing period even after the rent
-- (and TDS) side of it has been settled — the common real-world pattern where a tenant
-- pays rent net of TDS on time but GST separately/later. Mirrors the existing
-- gst_amount/gst_applicable columns: rent_payments carries the latest installment's
-- figure, payment_transactions carries each installment's own.
ALTER TABLE public.rent_payments
  ADD COLUMN IF NOT EXISTS gst_pending_amount NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS gst_pending_amount NUMERIC NOT NULL DEFAULT 0;

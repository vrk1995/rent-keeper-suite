-- GST was only ever modelled at the invoice level (tenants.requires_gst + the 18% shown on
-- the invoice PDF) — nothing downstream of that tracked it. When a tenant's rent attracts
-- GST, the tenant actually pays rent + GST, and the owner passes the GST portion on to the
-- government later. But rent_payments.amount (and everything compared against it — "Total
-- Due", the Mark Paid dialog's "Full Amount" option, isFullyPaid) is deliberately rent-only,
-- so there was no way to record the GST-inclusive amount actually received: the owner could
-- only ever mark the bare rent (rent = amount received minus GST) as settled.
--
-- These new columns mirror the existing tds_applicable/tds_amount pair exactly, letting a
-- payment separately track "GST collected on top of this installment" without changing what
-- rent_payments.amount/paid_amount mean (still pure rent, so due/overdue tracking and the GST
-- ledger — which reads invoice amounts — are untouched). payment_transactions.received_amount
-- becomes amount + gst_amount - tds_amount: the actual cash that changed hands.
ALTER TABLE public.rent_payments
  ADD COLUMN IF NOT EXISTS gst_applicable BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gst_amount NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS gst_amount NUMERIC NOT NULL DEFAULT 0;

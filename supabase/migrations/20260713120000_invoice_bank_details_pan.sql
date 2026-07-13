-- 1. PAN on billing_addresses (single value per address, same pattern as gstin)
ALTER TABLE public.billing_addresses ADD COLUMN IF NOT EXISTS pan TEXT;

-- 2. Bank accounts: one billing address can have several saved accounts, one marked default.
--    billing_addresses predates the workspace_id migration and is still scoped by plain
--    user_id, so this mirrors that same ownership model rather than the workspace_id one
--    used by most other tables.
CREATE TABLE IF NOT EXISTS public.billing_address_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_address_id UUID NOT NULL REFERENCES public.billing_addresses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  ifsc TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_address_bank_accounts_billing_address_id_idx
  ON public.billing_address_bank_accounts (billing_address_id);

ALTER TABLE public.billing_address_bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own bank accounts"
ON public.billing_address_bank_accounts FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create bank accounts"
ON public.billing_address_bank_accounts FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bank accounts"
ON public.billing_address_bank_accounts FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own bank accounts"
ON public.billing_address_bank_accounts FOR DELETE
USING (auth.uid() = user_id);

CREATE TRIGGER update_billing_address_bank_accounts_updated_at
BEFORE UPDATE ON public.billing_address_bank_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Snapshot fields on tenants (mirrors the existing bill_from_gstin pattern — set when a
--    billing address / bank account is selected, editable per tenant afterwards)
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS bill_from_pan TEXT,
  ADD COLUMN IF NOT EXISTS bill_from_bank_name TEXT,
  ADD COLUMN IF NOT EXISTS bill_from_account_number TEXT,
  ADD COLUMN IF NOT EXISTS bill_from_ifsc TEXT;

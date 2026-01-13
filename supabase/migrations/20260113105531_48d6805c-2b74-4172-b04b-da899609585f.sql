-- Create billing_addresses table to store reusable "Bill From" details
CREATE TABLE public.billing_addresses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  gstin TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.billing_addresses ENABLE ROW LEVEL SECURITY;

-- RLS policies - users can only manage their own billing addresses
CREATE POLICY "Users can view their own billing addresses"
ON public.billing_addresses
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create billing addresses"
ON public.billing_addresses
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own billing addresses"
ON public.billing_addresses
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own billing addresses"
ON public.billing_addresses
FOR DELETE
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_billing_addresses_updated_at
BEFORE UPDATE ON public.billing_addresses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
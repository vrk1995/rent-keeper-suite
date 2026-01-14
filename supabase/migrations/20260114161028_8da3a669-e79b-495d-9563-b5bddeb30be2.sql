-- Add invoice prefix field to properties
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS invoice_prefix text;

-- Create invoice sequence table to track invoice numbers per property per year
CREATE TABLE IF NOT EXISTS public.invoice_sequences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  last_sequence INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(property_id, year)
);

-- Enable RLS
ALTER TABLE public.invoice_sequences ENABLE ROW LEVEL SECURITY;

-- RLS policies for invoice_sequences
CREATE POLICY "Users can view invoice sequences of their properties"
ON public.invoice_sequences
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM properties p WHERE p.id = invoice_sequences.property_id AND p.owner_id = auth.uid()
));

CREATE POLICY "Users can insert invoice sequences for their properties"
ON public.invoice_sequences
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM properties p WHERE p.id = invoice_sequences.property_id AND p.owner_id = auth.uid()
));

CREATE POLICY "Users can update invoice sequences of their properties"
ON public.invoice_sequences
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM properties p WHERE p.id = invoice_sequences.property_id AND p.owner_id = auth.uid()
));

-- Create trigger for updated_at
CREATE TRIGGER update_invoice_sequences_updated_at
BEFORE UPDATE ON public.invoice_sequences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
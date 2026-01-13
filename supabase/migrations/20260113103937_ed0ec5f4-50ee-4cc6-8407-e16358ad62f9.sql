-- Create property_expenses table for tracking property-related expenses
CREATE TABLE public.property_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  vendor_name TEXT,
  vendor_contact TEXT,
  category TEXT DEFAULT 'general',
  payment_method TEXT,
  receipt_url TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.property_expenses ENABLE ROW LEVEL SECURITY;

-- RLS policies - only property owners can manage expenses
CREATE POLICY "Users can view expenses of their properties"
ON public.property_expenses
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM properties
  WHERE properties.id = property_expenses.property_id
  AND properties.owner_id = auth.uid()
));

CREATE POLICY "Users can create expenses for their properties"
ON public.property_expenses
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM properties
  WHERE properties.id = property_expenses.property_id
  AND properties.owner_id = auth.uid()
));

CREATE POLICY "Users can update expenses of their properties"
ON public.property_expenses
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM properties
  WHERE properties.id = property_expenses.property_id
  AND properties.owner_id = auth.uid()
));

CREATE POLICY "Users can delete expenses of their properties"
ON public.property_expenses
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM properties
  WHERE properties.id = property_expenses.property_id
  AND properties.owner_id = auth.uid()
));

-- Add trigger for updated_at
CREATE TRIGGER update_property_expenses_updated_at
BEFORE UPDATE ON public.property_expenses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
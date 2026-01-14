-- Create tenant_owner_shares junction table
CREATE TABLE public.tenant_owner_shares (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.property_owners(id) ON DELETE CASCADE,
  share_percentage NUMERIC(5,2) NOT NULL CHECK (share_percentage > 0 AND share_percentage <= 100),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, owner_id)
);

-- Enable RLS
ALTER TABLE public.tenant_owner_shares ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view tenant owner shares"
ON public.tenant_owner_shares
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM tenants t
    JOIN properties p ON p.id = t.property_id
    WHERE t.id = tenant_owner_shares.tenant_id AND p.owner_id = auth.uid()
  )
);

CREATE POLICY "Users can insert tenant owner shares"
ON public.tenant_owner_shares
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tenants t
    JOIN properties p ON p.id = t.property_id
    WHERE t.id = tenant_owner_shares.tenant_id AND p.owner_id = auth.uid()
  )
);

CREATE POLICY "Users can update tenant owner shares"
ON public.tenant_owner_shares
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM tenants t
    JOIN properties p ON p.id = t.property_id
    WHERE t.id = tenant_owner_shares.tenant_id AND p.owner_id = auth.uid()
  )
);

CREATE POLICY "Users can delete tenant owner shares"
ON public.tenant_owner_shares
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM tenants t
    JOIN properties p ON p.id = t.property_id
    WHERE t.id = tenant_owner_shares.tenant_id AND p.owner_id = auth.uid()
  )
);

-- Add trigger for updated_at
CREATE TRIGGER update_tenant_owner_shares_updated_at
BEFORE UPDATE ON public.tenant_owner_shares
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
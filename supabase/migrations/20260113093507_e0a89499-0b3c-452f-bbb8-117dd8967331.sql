-- Function to update property status based on tenant count
CREATE OR REPLACE FUNCTION public.update_property_status()
RETURNS TRIGGER AS $$
DECLARE
  tenant_count INTEGER;
  property_total_sqft NUMERIC;
  tenant_total_rented_sqft NUMERIC;
BEGIN
  -- Determine the property_id to update
  DECLARE
    target_property_id UUID;
  BEGIN
    IF TG_OP = 'DELETE' THEN
      target_property_id := OLD.property_id;
    ELSE
      target_property_id := NEW.property_id;
    END IF;

    -- Count active tenants for this property
    SELECT COUNT(*), COALESCE(SUM(rented_sqft), 0)
    INTO tenant_count, tenant_total_rented_sqft
    FROM tenants
    WHERE property_id = target_property_id
      AND status = 'active';

    -- Get property total sqft
    SELECT COALESCE(total_sqft, 0)
    INTO property_total_sqft
    FROM properties
    WHERE id = target_property_id;

    -- Update property status based on tenant count
    IF tenant_count = 0 THEN
      UPDATE properties SET status = 'vacant' WHERE id = target_property_id;
    ELSIF property_total_sqft > 0 AND tenant_total_rented_sqft < property_total_sqft THEN
      UPDATE properties SET status = 'partial' WHERE id = target_property_id;
    ELSE
      UPDATE properties SET status = 'occupied' WHERE id = target_property_id;
    END IF;
  END;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger on tenant insert
CREATE TRIGGER update_property_status_on_tenant_insert
AFTER INSERT ON tenants
FOR EACH ROW
EXECUTE FUNCTION update_property_status();

-- Trigger on tenant update (status changes, property changes)
CREATE TRIGGER update_property_status_on_tenant_update
AFTER UPDATE ON tenants
FOR EACH ROW
EXECUTE FUNCTION update_property_status();

-- Trigger on tenant delete
CREATE TRIGGER update_property_status_on_tenant_delete
AFTER DELETE ON tenants
FOR EACH ROW
EXECUTE FUNCTION update_property_status();
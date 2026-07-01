
CREATE OR REPLACE FUNCTION public.refresh_property_status()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE
  tenant_count int;
  rented numeric;
BEGIN
  SELECT COUNT(*), COALESCE(SUM(rented_sqft),0) INTO tenant_count, rented
  FROM tenants WHERE property_id = NEW.id AND status='active';

  IF tenant_count = 0 THEN
    NEW.status := 'vacant';
  ELSIF COALESCE(NEW.total_sqft,0) > 0 AND rented < NEW.total_sqft THEN
    NEW.status := 'partial';
  ELSE
    NEW.status := 'occupied';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS refresh_property_status_on_update ON public.properties;
CREATE TRIGGER refresh_property_status_on_update
BEFORE UPDATE OF total_sqft ON public.properties
FOR EACH ROW EXECUTE FUNCTION public.refresh_property_status();

-- Recompute status for all existing properties now
UPDATE public.properties p SET status = CASE
  WHEN (SELECT COUNT(*) FROM tenants t WHERE t.property_id=p.id AND t.status='active')=0 THEN 'vacant'
  WHEN COALESCE(p.total_sqft,0) > 0
    AND COALESCE((SELECT SUM(rented_sqft) FROM tenants t WHERE t.property_id=p.id AND t.status='active'),0) < p.total_sqft
    THEN 'partial'
  ELSE 'occupied'
END;

-- Attach existing update_property_status function to tenants for auto status refresh
DROP TRIGGER IF EXISTS trg_tenants_update_property_status ON public.tenants;
CREATE TRIGGER trg_tenants_update_property_status
AFTER INSERT OR UPDATE OR DELETE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.update_property_status();
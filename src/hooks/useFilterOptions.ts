import { useMemo } from "react";
import { useProperties } from "@/hooks/useProperties";
import { useTenants } from "@/hooks/useTenants";
import type { SearchableSelectOption } from "@/components/ui/searchable-select";

/**
 * Centralized hook that returns property and tenant options
 * for use in SearchableSelect filters across all pages.
 */
export const useFilterOptions = () => {
  const { data: properties } = useProperties();
  const { data: tenants } = useTenants();

  const propertyOptions: SearchableSelectOption[] = useMemo(() => {
    return (properties || [])
      .map((p) => ({ value: p.id, label: p.name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [properties]);

  const tenantOptions: SearchableSelectOption[] = useMemo(() => {
    return (tenants || [])
      .map((t) => ({ value: t.id, label: t.name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [tenants]);

  return { propertyOptions, tenantOptions, properties, tenants };
};

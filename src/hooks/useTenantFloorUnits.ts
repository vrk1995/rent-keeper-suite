import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TenantFloorUnit {
  id: string;
  tenant_id: string;
  floor_unit_id: string;
  created_at: string;
  floor_units?: {
    id: string;
    corp_number: string;
    floor_id: string;
    area_sqft: number;
  };
  tenants?: {
    id: string;
    name: string;
    status: string;
  };
}

export function useTenantFloorUnits(tenantId?: string) {
  const queryClient = useQueryClient();

  const { data: tenantFloorUnits, isLoading, error } = useQuery({
    queryKey: ["tenant-floor-units", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_floor_units")
        .select(`*, floor_units (id, corp_number, floor_id, area_sqft)`)
        .eq("tenant_id", tenantId!);

      if (error) throw error;
      return data as TenantFloorUnit[];
    },
    enabled: !!tenantId,
  });

  const upsertFloorUnits = useMutation({
    mutationFn: async ({
      tenantId,
      floorUnitIds,
    }: {
      tenantId: string;
      floorUnitIds: string[];
    }) => {
      const { error: deleteError } = await supabase
        .from("tenant_floor_units")
        .delete()
        .eq("tenant_id", tenantId);

      if (deleteError) throw deleteError;

      if (floorUnitIds.length > 0) {
        const { error: insertError } = await supabase
          .from("tenant_floor_units")
          .insert(floorUnitIds.map((floor_unit_id) => ({ tenant_id: tenantId, floor_unit_id })));

        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-floor-units"] });
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
    },
  });

  return {
    tenantFloorUnits,
    isLoading,
    error,
    upsertFloorUnits,
  };
}

export function useAllTenantFloorUnits() {
  const { data: allTenantFloorUnits, isLoading, error } = useQuery({
    queryKey: ["tenant-floor-units", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_floor_units")
        .select(`*, tenants (id, name, status)`);

      if (error) throw error;
      return data as TenantFloorUnit[];
    },
  });

  return {
    allTenantFloorUnits,
    isLoading,
    error,
  };
}

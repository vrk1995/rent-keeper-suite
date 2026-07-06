import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TenantOwnerShare {
  id: string;
  tenant_id: string;
  owner_id: string;
  share_percentage: number;
  created_at: string;
  updated_at: string;
  property_owners?: {
    id: string;
    name: string;
  };
}

export function useTenantOwnerShares(tenantId?: string) {
  const queryClient = useQueryClient();

  const { data: ownerShares, isLoading, error } = useQuery({
    queryKey: ["tenant-owner-shares", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_owner_shares")
        .select(`
          *,
          property_owners (id, name)
        `)
        .eq("tenant_id", tenantId!)
        .order("share_percentage", { ascending: false });

      if (error) throw error;
      return data as TenantOwnerShare[];
    },
    enabled: !!tenantId,
  });

  const upsertOwnerShares = useMutation({
    mutationFn: async ({ 
      tenantId, 
      shares 
    }: { 
      tenantId: string; 
      shares: { owner_id: string; share_percentage: number }[] 
    }) => {
      // First delete existing shares for this tenant
      const { error: deleteError } = await supabase
        .from("tenant_owner_shares")
        .delete()
        .eq("tenant_id", tenantId);
      
      if (deleteError) throw deleteError;

      // Then insert new shares
      if (shares.length > 0) {
        const { error: insertError } = await supabase
          .from("tenant_owner_shares")
          .insert(
            shares.map(share => ({
              tenant_id: tenantId,
              owner_id: share.owner_id,
              share_percentage: share.share_percentage,
            }))
          );
        
        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-owner-shares"] });
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
    },
  });

  return {
    ownerShares,
    isLoading,
    error,
    upsertOwnerShares,
  };
}

export function useAllTenantOwnerShares() {
  const { data: allOwnerShares, isLoading, error } = useQuery({
    queryKey: ["tenant-owner-shares", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_owner_shares")
        .select(`
          *,
          property_owners (id, name)
        `)
        .order("share_percentage", { ascending: false });
      
      if (error) throw error;
      return data as TenantOwnerShare[];
    },
  });

  return {
    allOwnerShares,
    isLoading,
    error,
  };
}

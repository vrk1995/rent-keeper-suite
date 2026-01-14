import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PropertyOwnerShare {
  id: string;
  property_id: string;
  owner_id: string;
  share_percentage: number;
  created_at: string;
  updated_at: string;
  property_owners?: {
    id: string;
    name: string;
  };
}

export interface CreatePropertyOwnerShareInput {
  property_id: string;
  owner_id: string;
  share_percentage: number;
}

export const usePropertyOwnerShares = (propertyId?: string) => {
  return useQuery({
    queryKey: ["property-owner-shares", propertyId],
    queryFn: async () => {
      let query = supabase
        .from("property_owner_shares")
        .select(`
          *,
          property_owners (
            id,
            name
          )
        `)
        .order("share_percentage", { ascending: false });

      if (propertyId) {
        query = query.eq("property_id", propertyId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as PropertyOwnerShare[];
    },
    enabled: !!propertyId,
  });
};

export const useBulkUpsertOwnerShares = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      property_id,
      shares,
    }: {
      property_id: string;
      shares: { owner_id: string; share_percentage: number }[];
    }) => {
      // First delete existing shares for this property
      const { error: deleteError } = await supabase
        .from("property_owner_shares")
        .delete()
        .eq("property_id", property_id);

      if (deleteError) throw deleteError;

      // If no shares to add, return
      if (shares.length === 0) return [];

      // Insert new shares
      const { data, error } = await supabase
        .from("property_owner_shares")
        .insert(
          shares.map((s) => ({
            property_id,
            owner_id: s.owner_id,
            share_percentage: s.share_percentage,
          }))
        )
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["property-owner-shares", variables.property_id] });
      queryClient.invalidateQueries({ queryKey: ["property-owner-shares"] });
      queryClient.invalidateQueries({ queryKey: ["properties"] });
    },
  });
};

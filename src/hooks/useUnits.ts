import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Unit {
  id: string;
  property_id: string;
  building_id: string | null; // Keep for backwards compatibility, will be deprecated
  name: string;
  floor_number: number | null;
  unit_type: string;
  monthly_rent: number;
  total_sqft: number;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  property?: {
    name: string;
    address: string;
  };
}

export interface CreateUnitInput {
  property_id: string;
  name: string;
  floor_number?: number;
  unit_type: string;
  monthly_rent: number;
  total_sqft?: number;
  status?: string;
  notes?: string;
}

export const useUnits = () => {
  return useQuery({
    queryKey: ["units"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("units")
        .select(`
          *,
          property:properties(name, address)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Unit[];
    },
  });
};

export const useUnitsByProperty = (propertyId: string | null) => {
  return useQuery({
    queryKey: ["units", propertyId],
    queryFn: async () => {
      if (!propertyId) return [];
      const { data, error } = await supabase
        .from("units")
        .select("*")
        .eq("property_id", propertyId)
        .order("floor_number", { ascending: true });

      if (error) throw error;
      return data as Unit[];
    },
    enabled: !!propertyId,
  });
};

export const usePropertiesWithUnits = () => {
  return useQuery({
    queryKey: ["properties-with-units"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select(`
          *,
          units(*)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });
};

export const useCreateUnit = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateUnitInput) => {
      // Note: building_id is required in DB but we're transitioning to property_id
      // Using property_id as building_id placeholder for backwards compatibility
      const { data, error } = await supabase
        .from("units")
        .insert({
          building_id: input.property_id, // Temporary: using property_id as building_id
          property_id: input.property_id,
          name: input.name,
          floor_number: input.floor_number,
          unit_type: input.unit_type,
          monthly_rent: input.monthly_rent,
          total_sqft: input.total_sqft,
          status: input.status,
          notes: input.notes,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["units"] });
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      queryClient.invalidateQueries({ queryKey: ["properties-with-units"] });
      toast.success("Unit added successfully!");
    },
    onError: (error) => {
      toast.error("Failed to add unit: " + error.message);
    },
  });
};

export const useUpdateUnit = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Unit> & { id: string }) => {
      const { data, error } = await supabase
        .from("units")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["units"] });
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      queryClient.invalidateQueries({ queryKey: ["properties-with-units"] });
      toast.success("Unit updated successfully!");
    },
    onError: (error) => {
      toast.error("Failed to update unit: " + error.message);
    },
  });
};

export const useDeleteUnit = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("units").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["units"] });
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      queryClient.invalidateQueries({ queryKey: ["properties-with-units"] });
      toast.success("Unit deleted successfully!");
    },
    onError: (error) => {
      toast.error("Failed to delete unit: " + error.message);
    },
  });
};

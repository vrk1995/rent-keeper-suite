import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface PropertyFloor {
  id: string;
  property_id: string;
  floor_name: string;
  floor_sqft: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateFloorInput {
  property_id: string;
  floor_name: string;
  floor_sqft: number;
  notes?: string;
}

export const usePropertyFloors = (propertyId: string) => {
  return useQuery({
    queryKey: ["property-floors", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_floors")
        .select("*")
        .eq("property_id", propertyId)
        .order("floor_name", { ascending: true });

      if (error) throw error;
      return data as PropertyFloor[];
    },
    enabled: !!propertyId,
  });
};

export const useCreateFloor = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateFloorInput) => {
      const { data, error } = await supabase
        .from("property_floors")
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["property-floors", variables.property_id] });
    },
    onError: (error) => {
      toast.error("Failed to add floor: " + error.message);
    },
  });
};

export const useUpdateFloor = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, property_id, ...updates }: Partial<PropertyFloor> & { id: string; property_id: string }) => {
      const { data, error } = await supabase
        .from("property_floors")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return { data, property_id };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["property-floors", result.property_id] });
    },
    onError: (error) => {
      toast.error("Failed to update floor: " + error.message);
    },
  });
};

export const useDeleteFloor = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, property_id }: { id: string; property_id: string }) => {
      const { error } = await supabase.from("property_floors").delete().eq("id", id);
      if (error) throw error;
      return { property_id };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["property-floors", result.property_id] });
    },
    onError: (error) => {
      toast.error("Failed to delete floor: " + error.message);
    },
  });
};

export const useBulkUpsertFloors = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      property_id, 
      floors 
    }: { 
      property_id: string; 
      floors: Array<{ floor_name: string; floor_sqft: number }> 
    }) => {
      // Load existing floors so we can preserve IDs (keeps tenants/floor_units linked)
      const { data: existing } = await supabase
        .from("property_floors")
        .select("id, floor_name")
        .eq("property_id", property_id);

      const existingByName = new Map((existing || []).map(f => [f.floor_name, f.id]));
      const incomingNames = new Set(floors.map(f => f.floor_name));

      // Delete floors that no longer exist in the incoming list
      const toDelete = (existing || []).filter(f => !incomingNames.has(f.floor_name)).map(f => f.id);
      if (toDelete.length > 0) {
        await supabase.from("property_floors").delete().in("id", toDelete);
      }

      // Upsert each incoming floor: update if exists, insert if new
      for (const f of floors) {
        const existingId = existingByName.get(f.floor_name);
        if (existingId) {
          await supabase
            .from("property_floors")
            .update({ floor_sqft: f.floor_sqft })
            .eq("id", existingId);
        } else {
          await supabase
            .from("property_floors")
            .insert({ property_id, floor_name: f.floor_name, floor_sqft: f.floor_sqft });
        }
      }

      return { property_id };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["property-floors", result.property_id] });
      queryClient.invalidateQueries({ queryKey: ["properties"] });
    },
    onError: (error) => {
      toast.error("Failed to save floors: " + error.message);
    },
  });
};

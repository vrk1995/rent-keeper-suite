import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface FloorUnit {
  id: string;
  property_id: string;
  floor_id: string;
  corp_number: string;
  area_sqft: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const useFloorUnitsByProperty = (propertyId: string | null | undefined) => {
  return useQuery({
    queryKey: ["floor-units", propertyId],
    queryFn: async () => {
      if (!propertyId) return [] as FloorUnit[];
      const { data, error } = await supabase
        .from("floor_units")
        .select("*")
        .eq("property_id", propertyId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as FloorUnit[];
    },
    enabled: !!propertyId,
  });
};

export const useAllFloorUnits = () => {
  return useQuery({
    queryKey: ["floor-units", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("floor_units")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as FloorUnit[];
    },
  });
};

export const useCreateFloorUnit = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<FloorUnit, "id" | "created_at" | "updated_at" | "notes"> & { notes?: string | null }) => {
      const { data, error } = await supabase.from("floor_units").insert(input).select().single();
      if (error) throw error;
      return data as FloorUnit;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["floor-units", vars.property_id] });
      qc.invalidateQueries({ queryKey: ["floor-units", "all"] });
    },
    onError: (e: Error) => toast.error("Failed to add unit: " + e.message),
  });
};

export const useUpdateFloorUnit = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, property_id, ...updates }: Partial<FloorUnit> & { id: string; property_id: string }) => {
      const { data, error } = await supabase.from("floor_units").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data as FloorUnit;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["floor-units", vars.property_id] });
      qc.invalidateQueries({ queryKey: ["floor-units", "all"] });
    },
    onError: (e: Error) => toast.error("Failed to update unit: " + e.message),
  });
};

export const useDeleteFloorUnit = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, property_id }: { id: string; property_id: string }) => {
      const { error } = await supabase.from("floor_units").delete().eq("id", id);
      if (error) throw error;
      return { property_id };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["floor-units", r.property_id] });
      qc.invalidateQueries({ queryKey: ["floor-units", "all"] });
    },
    onError: (e: Error) => toast.error("Failed to delete unit: " + e.message),
  });
};

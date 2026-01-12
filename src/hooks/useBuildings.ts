import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Building {
  id: string;
  owner_id: string;
  name: string;
  address: string;
  total_floors: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  units?: Unit[];
}

export interface Unit {
  id: string;
  building_id: string;
  name: string;
  floor_number: number | null;
  unit_type: string;
  monthly_rent: number;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  building?: {
    name: string;
    address: string;
  };
}

export interface CreateBuildingInput {
  name: string;
  address: string;
  total_floors?: number;
  notes?: string;
}

export interface CreateUnitInput {
  building_id: string;
  name: string;
  floor_number?: number;
  unit_type: string;
  monthly_rent: number;
  status?: string;
  notes?: string;
}

export const useBuildings = () => {
  return useQuery({
    queryKey: ["buildings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Building[];
    },
  });
};

export const useBuildingsWithUnits = () => {
  return useQuery({
    queryKey: ["buildings-with-units"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select(`
          *,
          units(*)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Building[];
    },
  });
};

export const useCreateBuilding = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateBuildingInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("buildings")
        .insert({
          ...input,
          owner_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["buildings"] });
      queryClient.invalidateQueries({ queryKey: ["buildings-with-units"] });
      toast.success("Building added successfully!");
    },
    onError: (error) => {
      toast.error("Failed to add building: " + error.message);
    },
  });
};

export const useUpdateBuilding = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Building> & { id: string }) => {
      const { data, error } = await supabase
        .from("buildings")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["buildings"] });
      queryClient.invalidateQueries({ queryKey: ["buildings-with-units"] });
      toast.success("Building updated successfully!");
    },
    onError: (error) => {
      toast.error("Failed to update building: " + error.message);
    },
  });
};

export const useDeleteBuilding = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("buildings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["buildings"] });
      queryClient.invalidateQueries({ queryKey: ["buildings-with-units"] });
      toast.success("Building deleted successfully!");
    },
    onError: (error) => {
      toast.error("Failed to delete building: " + error.message);
    },
  });
};

// Units hooks
export const useUnits = () => {
  return useQuery({
    queryKey: ["units"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("units")
        .select(`
          *,
          building:buildings(name, address)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Unit[];
    },
  });
};

export const useUnitsByBuilding = (buildingId: string) => {
  return useQuery({
    queryKey: ["units", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("units")
        .select("*")
        .eq("building_id", buildingId)
        .order("floor_number", { ascending: true });

      if (error) throw error;
      return data as Unit[];
    },
    enabled: !!buildingId,
  });
};

export const useCreateUnit = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateUnitInput) => {
      const { data, error } = await supabase
        .from("units")
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["units"] });
      queryClient.invalidateQueries({ queryKey: ["buildings-with-units"] });
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
      queryClient.invalidateQueries({ queryKey: ["buildings-with-units"] });
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
      queryClient.invalidateQueries({ queryKey: ["buildings-with-units"] });
      toast.success("Unit deleted successfully!");
    },
    onError: (error) => {
      toast.error("Failed to delete unit: " + error.message);
    },
  });
};

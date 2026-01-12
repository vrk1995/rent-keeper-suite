import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Tenant {
  id: string;
  property_id: string;
  unit_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  move_in_date: string;
  lease_start_date: string;
  lease_end_date: string;
  security_deposit: number;
  status: string;
  created_at: string;
  updated_at: string;
  property?: {
    name: string;
    address: string;
  };
  unit?: {
    name: string;
    building?: {
      name: string;
    };
  };
}

export interface CreateTenantInput {
  property_id: string;
  unit_id?: string;
  name: string;
  email?: string;
  phone?: string;
  move_in_date: string;
  lease_start_date: string;
  lease_end_date: string;
  security_deposit?: number;
  status?: string;
}

export const useTenants = () => {
  return useQuery({
    queryKey: ["tenants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select(`
          *,
          property:properties(name, address),
          unit:units(name, building:buildings(name))
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Tenant[];
    },
  });
};

export const useTenantsByProperty = (propertyId: string) => {
  return useQuery({
    queryKey: ["tenants", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .eq("property_id", propertyId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Tenant[];
    },
    enabled: !!propertyId,
  });
};

export const useCreateTenant = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateTenantInput) => {
      const { data, error } = await supabase
        .from("tenants")
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      toast.success("Tenant added successfully!");
    },
    onError: (error) => {
      toast.error("Failed to add tenant: " + error.message);
    },
  });
};

export const useUpdateTenant = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Tenant> & { id: string }) => {
      const { data, error } = await supabase
        .from("tenants")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      toast.success("Tenant updated successfully!");
    },
    onError: (error) => {
      toast.error("Failed to update tenant: " + error.message);
    },
  });
};

export const useDeleteTenant = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tenants").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      toast.success("Tenant deleted successfully!");
    },
    onError: (error) => {
      toast.error("Failed to delete tenant: " + error.message);
    },
  });
};

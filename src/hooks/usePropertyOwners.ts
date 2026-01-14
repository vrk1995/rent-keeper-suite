import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface PropertyOwner {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface CreatePropertyOwnerInput {
  name: string;
}

export const usePropertyOwners = () => {
  return useQuery({
    queryKey: ["property-owners"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_owners")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw error;
      return data as PropertyOwner[];
    },
  });
};

export const useCreatePropertyOwner = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreatePropertyOwnerInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("property_owners")
        .insert({
          ...input,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data as PropertyOwner;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["property-owners"] });
      toast.success("Owner added successfully!");
    },
    onError: (error) => {
      toast.error("Failed to add owner: " + error.message);
    },
  });
};

export const useUpdatePropertyOwner = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<PropertyOwner> & { id: string }) => {
      const { data, error } = await supabase
        .from("property_owners")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as PropertyOwner;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["property-owners"] });
      toast.success("Owner updated successfully!");
    },
    onError: (error) => {
      toast.error("Failed to update owner: " + error.message);
    },
  });
};

export const useDeletePropertyOwner = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("property_owners")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["property-owners"] });
      toast.success("Owner deleted successfully!");
    },
    onError: (error) => {
      toast.error("Failed to delete owner: " + error.message);
    },
  });
};

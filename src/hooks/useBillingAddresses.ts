import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface BillingAddress {
  id: string;
  user_id: string;
  name: string;
  address: string | null;
  gstin: string | null;
  pan: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateBillingAddressInput {
  name: string;
  address?: string;
  gstin?: string;
  pan?: string;
  is_default?: boolean;
}

export const useBillingAddresses = () => {
  return useQuery({
    queryKey: ["billing-addresses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_addresses")
        .select("*")
        .order("is_default", { ascending: false })
        .order("name", { ascending: true });

      if (error) throw error;
      return data as BillingAddress[];
    },
  });
};

export const useCreateBillingAddress = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateBillingAddressInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // If this is set as default, unset other defaults first
      if (input.is_default) {
        await supabase
          .from("billing_addresses")
          .update({ is_default: false })
          .eq("user_id", user.id);
      }

      const { data, error } = await supabase
        .from("billing_addresses")
        .insert({
          ...input,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-addresses"] });
      toast.success("Billing address saved!");
    },
    onError: (error) => {
      toast.error("Failed to save billing address: " + error.message);
    },
  });
};

export const useUpdateBillingAddress = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<BillingAddress> & { id: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // If this is set as default, unset other defaults first
      if (updates.is_default) {
        await supabase
          .from("billing_addresses")
          .update({ is_default: false })
          .eq("user_id", user.id);
      }

      const { data, error } = await supabase
        .from("billing_addresses")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-addresses"] });
      toast.success("Billing address updated!");
    },
    onError: (error) => {
      toast.error("Failed to update billing address: " + error.message);
    },
  });
};

export const useDeleteBillingAddress = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("billing_addresses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-addresses"] });
      toast.success("Billing address deleted!");
    },
    onError: (error) => {
      toast.error("Failed to delete billing address: " + error.message);
    },
  });
};

// Helper to check if a billing address already exists
export const useCheckDuplicateBillingAddress = () => {
  return useMutation({
    mutationFn: async ({ name, gstin }: { name: string; gstin?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      // Check by name or GSTIN if provided
      let query = supabase
        .from("billing_addresses")
        .select("id")
        .eq("user_id", user.id)
        .eq("name", name);

      const { data } = await query.maybeSingle();
      return data;
    },
  });
};

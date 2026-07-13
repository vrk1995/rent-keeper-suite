import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface BankAccount {
  id: string;
  billing_address_id: string;
  bank_name: string;
  account_number: string;
  ifsc: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateBankAccountInput {
  billing_address_id: string;
  bank_name: string;
  account_number: string;
  ifsc: string;
  is_default?: boolean;
}

/** Bank accounts saved under a specific billing address. */
export const useBankAccounts = (billingAddressId?: string) => {
  return useQuery({
    queryKey: ["billing-address-bank-accounts", billingAddressId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_address_bank_accounts")
        .select("*")
        .eq("billing_address_id", billingAddressId!)
        .order("is_default", { ascending: false })
        .order("bank_name", { ascending: true });

      if (error) throw error;
      return data as BankAccount[];
    },
    enabled: !!billingAddressId,
  });
};

export const useCreateBankAccount = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateBankAccountInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (input.is_default) {
        await supabase
          .from("billing_address_bank_accounts")
          .update({ is_default: false })
          .eq("billing_address_id", input.billing_address_id);
      }

      const { data, error } = await supabase
        .from("billing_address_bank_accounts")
        .insert({ ...input, user_id: user.id })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-address-bank-accounts"] });
      toast.success("Bank account saved!");
    },
    onError: (error) => {
      toast.error("Failed to save bank account: " + error.message);
    },
  });
};

export const useUpdateBankAccount = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<BankAccount> & { id: string }) => {
      if (updates.is_default && updates.billing_address_id) {
        await supabase
          .from("billing_address_bank_accounts")
          .update({ is_default: false })
          .eq("billing_address_id", updates.billing_address_id);
      }

      const { data, error } = await supabase
        .from("billing_address_bank_accounts")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-address-bank-accounts"] });
      toast.success("Bank account updated!");
    },
    onError: (error) => {
      toast.error("Failed to update bank account: " + error.message);
    },
  });
};

export const useDeleteBankAccount = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("billing_address_bank_accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-address-bank-accounts"] });
      toast.success("Bank account deleted!");
    },
    onError: (error) => {
      toast.error("Failed to delete bank account: " + error.message);
    },
  });
};

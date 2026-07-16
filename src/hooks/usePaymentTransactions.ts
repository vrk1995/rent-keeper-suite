import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PaymentTransaction {
  id: string;
  rent_payment_id: string;
  amount: number;
  tds_amount: number;
  received_amount: number;
  paid_date: string;
  payment_method: string | null;
  notes: string | null;
  created_at: string;
}

export interface CreatePaymentTransactionInput {
  rent_payment_id: string;
  amount: number;
  tds_amount: number;
  received_amount: number;
  paid_date: string;
  payment_method?: string;
  notes?: string;
}

/** Every individual installment recorded against one month's rent, oldest first. */
export const usePaymentTransactions = (rentPaymentId?: string) => {
  return useQuery({
    queryKey: ["payment-transactions", rentPaymentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_transactions")
        .select("*")
        .eq("rent_payment_id", rentPaymentId!)
        .order("paid_date", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as PaymentTransaction[];
    },
    enabled: !!rentPaymentId,
  });
};

export const useCreatePaymentTransaction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreatePaymentTransactionInput) => {
      const { data, error } = await supabase
        .from("payment_transactions")
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["payment-transactions", variables.rent_payment_id] });
      queryClient.invalidateQueries({ queryKey: ["payment-transactions"] });
    },
  });
};

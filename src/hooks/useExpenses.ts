import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Expense {
  id: string;
  property_id: string;
  title: string;
  description: string | null;
  amount: number;
  expense_date: string;
  vendor_name: string | null;
  vendor_contact: string | null;
  category: string | null;
  payment_method: string | null;
  paid_by: string | null;
  receipt_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateExpenseInput {
  property_id: string;
  title: string;
  description?: string;
  amount: number;
  expense_date: string;
  vendor_name?: string;
  vendor_contact?: string;
  category?: string;
  payment_method?: string;
  paid_by?: string;
  receipt_url?: string;
}


export const useExpensesByProperty = (propertyId: string) => {
  return useQuery({
    queryKey: ["expenses", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_expenses")
        .select("*")
        .eq("property_id", propertyId)
        .order("expense_date", { ascending: false });

      if (error) throw error;
      return data as Expense[];
    },
    enabled: !!propertyId,
  });
};

export interface ExpenseWithProperty extends Expense {
  property?: { id: string; name: string } | null;
}

export const useAllExpenses = () => {
  return useQuery({
    queryKey: ["expenses", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_expenses")
        .select("*, property:properties(id, name)")
        .order("expense_date", { ascending: false });

      if (error) throw error;
      return data as ExpenseWithProperty[];
    },
  });
};

export const useCreateExpense = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateExpenseInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("property_expenses")
        .insert({
          ...input,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Expense added successfully!");
    },
    onError: (error) => {
      toast.error("Failed to add expense: " + error.message);
    },
  });
};

export const useUpdateExpense = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Expense> & { id: string }) => {
      const { data, error } = await supabase
        .from("property_expenses")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Expense updated successfully!");
    },
    onError: (error) => {
      toast.error("Failed to update expense: " + error.message);
    },
  });
};

export const useDeleteExpense = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, propertyId }: { id: string; propertyId: string }) => {
      const { error } = await supabase.from("property_expenses").delete().eq("id", id);
      if (error) throw error;
      return propertyId;
    },
    onSuccess: (propertyId) => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Expense deleted successfully!");
    },
    onError: (error) => {
      toast.error("Failed to delete expense: " + error.message);
    },
  });
};

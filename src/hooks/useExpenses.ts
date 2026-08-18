import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Expense {
  id: string;
  property_id: string;
  floor_unit_id: string | null;
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
  period_from: string | null;
  period_to: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateExpenseInput {
  property_id: string;
  floor_unit_id?: string | null;
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
  period_from?: string | null;
  period_to?: string | null;
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

/** Recently-used expense titles across the whole portfolio, most recent first and
 *  deduplicated — powers the "type or pick from before" combobox on the Title field. */
export const useExpenseTitleSuggestions = () => {
  return useQuery({
    queryKey: ["expenses", "title-suggestions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_expenses")
        .select("title")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const seen = new Set<string>();
      const titles: string[] = [];
      for (const row of data || []) {
        const key = row.title.trim();
        if (!key || seen.has(key.toLowerCase())) continue;
        seen.add(key.toLowerCase());
        titles.push(key);
      }
      return titles;
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
    mutationFn: async ({ id, propertyId, receiptPath }: { id: string; propertyId: string; receiptPath?: string | null }) => {
      const { error } = await supabase.from("property_expenses").delete().eq("id", id);
      if (error) throw error;
      // Best-effort: the row is already gone either way, and a leftover file with no
      // referencing row is harmless — never block the delete on cleanup failing.
      if (receiptPath) {
        await deleteExpenseReceiptFile(receiptPath).catch((err) =>
          console.error("Failed to delete receipt file:", err)
        );
      }
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

const EXPENSE_RECEIPTS_BUCKET = "expense-receipts";

/** Uploads a scanned/photographed bill to the private expense-receipts bucket and returns
 *  its STORAGE PATH (not a URL — the bucket is private, so viewing always goes through a
 *  freshly-minted signed URL instead of a stored one that could expire or leak). */
export async function uploadExpenseReceipt(file: File, propertyId: string): Promise<string> {
  const ext = file.name.split(".").pop();
  const path = `${propertyId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext ? `.${ext}` : ""}`;
  const { error } = await supabase.storage.from(EXPENSE_RECEIPTS_BUCKET).upload(path, file);
  if (error) throw error;
  return path;
}

/** Short-lived signed URL for viewing/downloading a receipt — generated fresh each time
 *  rather than stored, since the bucket is private. */
export async function getExpenseReceiptViewUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(EXPENSE_RECEIPTS_BUCKET)
    .createSignedUrl(path, 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteExpenseReceiptFile(path: string): Promise<void> {
  const { error } = await supabase.storage.from(EXPENSE_RECEIPTS_BUCKET).remove([path]);
  if (error) throw error;
}

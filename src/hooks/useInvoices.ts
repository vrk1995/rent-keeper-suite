import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFinancialYear } from "@/contexts/FinancialYearContext";
import { toast } from "sonner";

export interface InvoiceItem {
  description: string;
  amount: number;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  property_id: string;
  tenant_id: string;
  amount: number;
  due_date: string;
  status: string;
  items: InvoiceItem[];
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  property?: {
    name: string;
    address: string;
  };
  tenant?: {
    name: string;
    email: string | null;
    phone: string | null;
  };
}

export interface CreateInvoiceInput {
  property_id: string;
  tenant_id: string;
  amount: number;
  due_date: string;
  items?: InvoiceItem[];
  notes?: string;
}

const generateInvoiceNumber = () => {
  const prefix = "INV";
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
};

export const useInvoices = () => {
  const { selectedFY } = useFinancialYear();
  return useQuery({
    queryKey: ["invoices", selectedFY.value],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(`
          *,
          property:properties(name, address),
          tenant:tenants(name, email, phone)
        `)
        .gte("due_date", selectedFY.startDate)
        .lte("due_date", selectedFY.endDate)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data.map((invoice) => ({
        ...invoice,
        items: Array.isArray(invoice.items) ? (invoice.items as unknown as InvoiceItem[]) : [],
      })) as Invoice[];
    },
  });
};

export const useCreateInvoice = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateInvoiceInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("invoices")
        .insert({
          property_id: input.property_id,
          tenant_id: input.tenant_id,
          amount: input.amount,
          due_date: input.due_date,
          notes: input.notes || null,
          invoice_number: generateInvoiceNumber(),
          items: JSON.stringify(input.items || []),
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Invoice created successfully!");
    },
    onError: (error) => {
      toast.error("Failed to create invoice: " + error.message);
    },
  });
};

export const useUpdateInvoiceStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { data, error } = await supabase
        .from("invoices")
        .update({ status })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Invoice status updated!");
    },
    onError: (error) => {
      toast.error("Failed to update invoice: " + error.message);
    },
  });
};

export const useDeleteInvoice = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invoices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Invoice deleted!");
    },
    onError: (error) => {
      toast.error("Failed to delete invoice: " + error.message);
    },
  });
};

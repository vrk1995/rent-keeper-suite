import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface RentPayment {
  id: string;
  property_id: string | null;
  unit_id: string | null;
  tenant_id: string;
  amount: number;
  due_date: string;
  paid_date: string | null;
  status: string;
  payment_method: string | null;
  marked_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  property?: {
    name: string;
  };
  unit?: {
    name: string;
    building?: {
      name: string;
    };
  };
  tenant?: {
    name: string;
  };
}

export interface CreatePaymentInput {
  property_id?: string;
  unit_id?: string;
  tenant_id: string;
  amount: number;
  due_date: string;
  status?: string;
  notes?: string;
}

export const usePayments = () => {
  return useQuery({
    queryKey: ["payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rent_payments")
        .select(`
          *,
          property:properties(name),
          unit:units(name, building:buildings(name)),
          tenant:tenants(name)
        `)
        .order("due_date", { ascending: false });

      if (error) throw error;
      return data as RentPayment[];
    },
  });
};

export const useUpcomingPayments = () => {
  return useQuery({
    queryKey: ["payments", "upcoming"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

      const { data, error } = await supabase
        .from("rent_payments")
        .select(`
          *,
          property:properties(name),
          unit:units(name, building:buildings(name)),
          tenant:tenants(name)
        `)
        .gte("due_date", today)
        .lte("due_date", thirtyDaysLater)
        .in("status", ["pending", "overdue"])
        .order("due_date", { ascending: true });

      if (error) throw error;
      return data as RentPayment[];
    },
  });
};

export const useCreatePayment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreatePaymentInput) => {
      // property_id is required in DB but we can use a placeholder when unit_id is provided
      const insertData = {
        ...input,
        property_id: input.property_id || null,
      };
      
      const { data, error } = await supabase
        .from("rent_payments")
        .insert(insertData as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      toast.success("Payment record created!");
    },
    onError: (error) => {
      toast.error("Failed to create payment: " + error.message);
    },
  });
};

export const useMarkPaymentPaid = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      payment_method,
    }: {
      id: string;
      payment_method?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from("rent_payments")
        .update({
          status: "paid",
          paid_date: new Date().toISOString().split("T")[0],
          payment_method,
          marked_by: user?.id,
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      toast.success("Payment marked as paid!");
    },
    onError: (error) => {
      toast.error("Failed to update payment: " + error.message);
    },
  });
};

export const useDeletePayment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rent_payments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      toast.success("Payment deleted!");
    },
    onError: (error) => {
      toast.error("Failed to delete payment: " + error.message);
    },
  });
};

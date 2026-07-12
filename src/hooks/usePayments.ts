import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFinancialYear } from "@/contexts/FinancialYearContext";
import { toast } from "sonner";

export interface RentPayment {
  id: string;
  property_id: string | null;
  unit_id: string | null;
  tenant_id: string;
  amount: number;
  due_date: string;
  billing_month: string | null;
  paid_date: string | null;
  status: string;
  payment_method: string | null;
  marked_by: string | null;
  notes: string | null;
  paid_amount: number;
  tds_applicable: boolean;
  tds_amount: number;
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
    tds_applicable?: boolean;
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
  const { selectedFY } = useFinancialYear();
  return useQuery({
    queryKey: ["payments", selectedFY?.value ?? "all"],
    queryFn: async () => {
      let query = supabase
        .from("rent_payments")
        .select(`
          *,
          property:properties(name),
          unit:units(name, building:buildings(name)),
          tenant:tenants(name, tds_applicable)
        `);

      if (selectedFY) {
        query = query.gte("due_date", selectedFY.startDate).lte("due_date", selectedFY.endDate);
      }

      const { data, error } = await query.order("due_date", { ascending: false });
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
          tenant:tenants(name, tds_applicable)
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
      paid_date,
      payment_method,
      notes,
      paid_amount,
      status,
      tds_applicable,
      tds_amount,
    }: {
      id: string;
      paid_date: string;
      payment_method?: string;
      notes?: string;
      paid_amount: number;
      status: "paid" | "partial";
      tds_applicable: boolean;
      tds_amount: number;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("rent_payments")
        .update({
          status,
          paid_date,
          payment_method,
          notes,
          paid_amount,
          tds_applicable,
          tds_amount,
          marked_by: user?.id,
        } as any)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      // Auto-sync invoice status with payment status
      try {
        const { data: payment } = await supabase
          .from("rent_payments")
          .select("property_id, tenant_id, due_date")
          .eq("id", id)
          .single();

        if (payment) {
          await supabase
            .from("invoices")
            .update({ status: status === "paid" ? "paid" : "partial" })
            .eq("property_id", payment.property_id)
            .eq("tenant_id", payment.tenant_id)
            .eq("due_date", payment.due_date);
        }
      } catch (syncError) {
        console.error("Failed to sync invoice status:", syncError);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      toast.success("Payment recorded!");
    },
    onError: (error) => {
      toast.error("Failed to update payment: " + error.message);
    },
  });
};

export const useGenerateMonthlyPayments = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ year, month }: { year: number; month: number }) => {
      const now = new Date();
      const billingMonth = `${year}-${String(month).padStart(2, '0')}`;

      // Get active tenants
      const { data: tenants, error: tenantsError } = await supabase
        .from("tenants")
        .select("id, property_id, unit_id, monthly_rent, rent_due_day, rent_due_month_offset, name")
        .eq("status", "active");

      if (tenantsError) throw tenantsError;

      // Get existing payments for this billing month
      const { data: existingPayments, error: paymentsError } = await supabase
        .from("rent_payments")
        .select("tenant_id, billing_month")
        .eq("billing_month", billingMonth);

      if (paymentsError) throw paymentsError;

      const existingSet = new Set(
        existingPayments?.map(p => p.tenant_id)
      );

      // Generate payments for tenants who don't have one for this billing month
      const paymentsToCreate = tenants
        ?.filter(tenant => !existingSet.has(tenant.id) && (tenant.monthly_rent || 0) > 0)
        .map(tenant => {
          const dueDay = Math.min(tenant.rent_due_day || 1, 28);
          const offset = (tenant as any).rent_due_month_offset ?? 0;
          // Due date is in the billing month shifted by the tenant's offset
          const dueDate = new Date(year, month - 1 + offset, dueDay)
            .toISOString()
            .split('T')[0];

          return {
            tenant_id: tenant.id,
            property_id: tenant.property_id,
            unit_id: tenant.unit_id,
            amount: tenant.monthly_rent || 0,
            due_date: dueDate,
            billing_month: billingMonth,
            status: new Date(dueDate) < now ? 'overdue' : 'pending',
          };
        }) || [];

      if (paymentsToCreate.length === 0) {
        return { created: 0, message: "No new payments to generate" };
      }

      const { error: insertError } = await supabase
        .from("rent_payments")
        .insert(paymentsToCreate as any);

      if (insertError) throw insertError;

      return { created: paymentsToCreate.length };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      if (result.created > 0) {
        toast.success(`Generated ${result.created} rent payment records!`);
      } else {
        toast.info("All payments for this month already exist");
      }
    },
    onError: (error) => {
      toast.error("Failed to generate payments: " + error.message);
    },
  });
};

export interface AdminUpdatePaymentInput {
  id: string;
  amount?: number;
  due_date?: string;
  paid_date?: string | null;
  payment_method?: string | null;
  notes?: string | null;
}

/** Direct field correction for admins — no toast of its own, callers combine it with any linked invoice update. */
export const useAdminUpdatePayment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: AdminUpdatePaymentInput) => {
      const { data, error } = await supabase
        .from("rent_payments")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
    },
  });
};

/** Admin-only "undo": deletes the recorded receipt (paid date/amount/method/notes/TDS) and
 *  puts the payment back to pending/overdue so it can be recorded again from scratch. */
export const useRevertPaymentToUnpaid = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data: existing, error: fetchError } = await supabase
        .from("rent_payments")
        .select("due_date")
        .eq("id", id)
        .single();
      if (fetchError) throw fetchError;

      const status = new Date(existing.due_date) < new Date() ? "overdue" : "pending";

      const { data, error } = await supabase
        .from("rent_payments")
        .update({
          status,
          paid_date: null,
          paid_amount: 0,
          payment_method: null,
          notes: null,
          tds_applicable: false,
          tds_amount: 0,
          marked_by: null,
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
    },
    onError: (error) => {
      toast.error("Failed to revert payment: " + error.message);
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

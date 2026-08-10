import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getISTToday } from "@/lib/istDate";

export interface PaymentTransaction {
  id: string;
  rent_payment_id: string;
  amount: number;
  tds_amount: number;
  gst_amount: number;
  received_amount: number;
  paid_date: string;
  payment_method: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CreatePaymentTransactionInput {
  rent_payment_id: string;
  amount: number;
  tds_amount: number;
  gst_amount: number;
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

/** After a single installment is edited or deleted, the parent rent_payments row's running
 *  totals (paid_amount, status, and the "latest installment" fields it mirrors) need
 *  recalculating from whatever transactions are left — same end-state as if those remaining
 *  transactions had been recorded one at a time via the normal Record Payment flow. */
async function recomputeRentPaymentFromTransactions(rentPaymentId: string) {
  const { data: remaining, error: txError } = await supabase
    .from("payment_transactions")
    .select("amount, tds_amount, gst_amount, paid_date, payment_method, notes")
    .eq("rent_payment_id", rentPaymentId)
    .order("paid_date", { ascending: true })
    .order("created_at", { ascending: true });
  if (txError) throw txError;

  const { data: payment, error: paymentError } = await supabase
    .from("rent_payments")
    .select("amount, due_date, property_id, tenant_id")
    .eq("id", rentPaymentId)
    .single();
  if (paymentError) throw paymentError;

  const txns = remaining || [];
  const paidAmount = txns.reduce((sum, t) => sum + Number(t.amount), 0);
  const latest = txns[txns.length - 1];
  const totalDue = Number(payment.amount);

  let status: string;
  if (paidAmount <= 0) {
    status = new Date(payment.due_date) < getISTToday() ? "overdue" : "pending";
  } else if (paidAmount >= totalDue) {
    status = "paid";
  } else {
    status = "partial";
  }

  const { error: updateError } = await supabase
    .from("rent_payments")
    .update({
      paid_amount: paidAmount,
      status,
      paid_date: latest?.paid_date || null,
      payment_method: latest?.payment_method || null,
      notes: latest?.notes || null,
      tds_amount: latest ? Number(latest.tds_amount) : 0,
      tds_applicable: latest ? Number(latest.tds_amount) > 0 : false,
      gst_amount: latest ? Number(latest.gst_amount) : 0,
      gst_applicable: latest ? Number(latest.gst_amount) > 0 : false,
    })
    .eq("id", rentPaymentId);
  if (updateError) throw updateError;

  // Best-effort: keep the matching invoice's status roughly in step. Invoices are matched by
  // natural key (no FK), same pattern used everywhere else this sync happens.
  try {
    const { data: invoice } = await supabase
      .from("invoices")
      .select("id")
      .eq("property_id", payment.property_id)
      .eq("tenant_id", payment.tenant_id)
      .eq("due_date", payment.due_date)
      .eq("amount", payment.amount)
      .maybeSingle();
    if (invoice) {
      const invoiceStatus = status === "paid" ? "paid" : status === "partial" ? "partial" : "sent";
      await supabase.from("invoices").update({ status: invoiceStatus }).eq("id", invoice.id);
    }
  } catch (syncError) {
    console.error("Failed to sync invoice status:", syncError);
  }
}

export interface UpdatePaymentTransactionInput {
  id: string;
  rent_payment_id: string;
  amount: number;
  tds_amount: number;
  gst_amount: number;
  paid_date: string;
  payment_method?: string;
  notes?: string;
}

/** Admin-only correction of a single recorded installment — edits its own fields directly
 *  (not a rate-based recompute) and rolls the parent payment's totals forward from the result. */
export const useUpdatePaymentTransaction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdatePaymentTransactionInput) => {
      const receivedAmount = input.amount + input.gst_amount - input.tds_amount;
      const { error } = await supabase
        .from("payment_transactions")
        .update({
          amount: input.amount,
          tds_amount: input.tds_amount,
          gst_amount: input.gst_amount,
          received_amount: receivedAmount,
          paid_date: input.paid_date,
          payment_method: input.payment_method || null,
          notes: input.notes || null,
        })
        .eq("id", input.id);
      if (error) throw error;

      await recomputeRentPaymentFromTransactions(input.rent_payment_id);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["payment-transactions", variables.rent_payment_id] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
};

/** Admin-only: removes just this one installment (e.g. an accidental duplicate) and
 *  recalculates the parent payment's totals from whatever's left — everything else recorded
 *  against that month's rent is untouched. */
export const useDeletePaymentTransaction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, rent_payment_id }: { id: string; rent_payment_id: string }) => {
      const { error } = await supabase.from("payment_transactions").delete().eq("id", id);
      if (error) throw error;

      await recomputeRentPaymentFromTransactions(rent_payment_id);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["payment-transactions", variables.rent_payment_id] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
};

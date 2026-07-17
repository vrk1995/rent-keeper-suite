import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const TDS_RATE = 0.1;
const round2 = (n: number) => Math.round(n * 100) / 100;
const roundToRupee = (n: number) => Math.round(n);

export interface ReconcileAllocation {
  rentPaymentId: string;
  /** Gross rent amount (before TDS) being applied to this invoice. */
  amount: number;
}

export interface ReconcilePaymentInput {
  paidDate: string;
  paymentMethod: string;
  notes?: string;
  tdsApplicable: boolean;
  allocations: ReconcileAllocation[];
}

/** Applies one lump-sum payment across multiple outstanding invoices (FIFO/LIFO/custom
 *  allocation is decided by the caller — this just executes the resulting per-invoice split).
 *  Each invoice gets its own payment_transactions ledger entry and its paid_amount/status
 *  updated, with TDS prorated proportionally to each invoice's share of the gross total. */
export const useReconcilePayment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ReconcilePaymentInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      const grossTotal = input.allocations.reduce((sum, a) => sum + a.amount, 0);
      const tdsTotal = input.tdsApplicable ? roundToRupee(grossTotal * TDS_RATE) : 0;

      const touchedRentPaymentIds: string[] = [];

      for (const alloc of input.allocations) {
        const tdsForAlloc = grossTotal > 0 ? roundToRupee((alloc.amount / grossTotal) * tdsTotal) : 0;
        const receivedForAlloc = alloc.amount - tdsForAlloc;

        const { error: txnError } = await supabase.from("payment_transactions").insert({
          rent_payment_id: alloc.rentPaymentId,
          amount: alloc.amount,
          tds_amount: tdsForAlloc,
          received_amount: receivedForAlloc,
          paid_date: input.paidDate,
          payment_method: input.paymentMethod,
          notes: input.notes,
        });
        if (txnError) throw txnError;

        const { data: payment, error: fetchError } = await supabase
          .from("rent_payments")
          .select("id, amount, paid_amount, property_id, tenant_id, due_date")
          .eq("id", alloc.rentPaymentId)
          .single();
        if (fetchError) throw fetchError;

        const newPaidAmount = (payment.paid_amount || 0) + alloc.amount;
        const newStatus = newPaidAmount >= payment.amount ? "paid" : "partial";

        const { error: updateError } = await supabase
          .from("rent_payments")
          .update({
            paid_amount: newPaidAmount,
            status: newStatus,
            paid_date: input.paidDate,
            payment_method: input.paymentMethod,
            notes: input.notes,
            tds_applicable: input.tdsApplicable,
            tds_amount: tdsForAlloc,
            marked_by: user?.id,
          })
          .eq("id", alloc.rentPaymentId);
        if (updateError) throw updateError;

        // Auto-sync invoice status, same as the single-invoice Mark Paid flow.
        await supabase
          .from("invoices")
          .update({ status: newStatus })
          .eq("property_id", payment.property_id)
          .eq("tenant_id", payment.tenant_id)
          .eq("due_date", payment.due_date);

        touchedRentPaymentIds.push(alloc.rentPaymentId);
      }

      return { touchedRentPaymentIds };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["tenant-payments"] });
      queryClient.invalidateQueries({ queryKey: ["payment-transactions"] });
    },
  });
};

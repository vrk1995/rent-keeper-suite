import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Undo2 } from "lucide-react";
import { RentPayment, useRevertPaymentToUnpaid } from "@/hooks/usePayments";
import { useUpdateInvoice } from "@/hooks/useInvoices";
import { useIsAdmin } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UndoPaymentButtonProps {
  payment: RentPayment;
  className?: string;
}

/** Admin-only action: deletes a recorded receipt and puts the payment back to
 *  pending/overdue so it can be recorded again. Only renders for paid/partial payments. */
export function UndoPaymentButton({ payment, className }: UndoPaymentButtonProps) {
  const { isAdmin } = useIsAdmin();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const revertPayment = useRevertPaymentToUnpaid();
  const updateInvoice = useUpdateInvoice();

  if (!isAdmin || (payment.status !== "paid" && payment.status !== "partial")) return null;

  const handleConfirm = async () => {
    try {
      await revertPayment.mutateAsync(payment.id);

      // Best-effort: if a matching invoice exists, put its status back to "sent" too.
      if (payment.property_id) {
        const { data: invoice } = await supabase
          .from("invoices")
          .select("id")
          .eq("property_id", payment.property_id)
          .eq("tenant_id", payment.tenant_id)
          .eq("due_date", payment.due_date)
          .eq("amount", payment.amount)
          .maybeSingle();
        if (invoice) {
          await updateInvoice.mutateAsync({ id: invoice.id, status: "sent" });
        }
      }

      toast.success("Payment undone — you can record it again anytime.");
    } catch {
      // revertPayment/updateInvoice already surfaced their own error toast
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={className}
        onClick={() => setConfirmOpen(true)}
        aria-label="Undo payment"
      >
        <Undo2 className="w-4 h-4" />
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo This Payment?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the recorded receipt for {payment.tenant?.name || "this tenant"} —
              paid date, amount received, method, and notes — and marks the payment as not
              paid. You can record payment again anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>Undo Payment</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Receipt, FileText, Loader2, History, Pencil, Undo2 } from "lucide-react";
import { RentPayment } from "@/hooks/usePayments";
import { PaymentTransaction, usePaymentTransactions, useDeletePaymentTransaction } from "@/hooks/usePaymentTransactions";
import { EditPaymentTransactionDialog } from "@/components/payments/EditPaymentTransactionDialog";
import { usePdfPreview } from "@/hooks/usePdfPreview";
import { PdfPreviewDialog } from "@/components/payments/PdfPreviewDialog";
import { ActivityLogList } from "@/components/activity/ActivityLogList";
import { formatINR } from "@/lib/currency";
import { formatIST } from "@/lib/dateFormat";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useUserRole";
import { toast } from "sonner";

interface PaymentHistoryDialogProps {
  payment: RentPayment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const methodLabels: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  upi: "UPI",
  cheque: "Cheque",
  other: "Other",
};

export function PaymentHistoryDialog({ payment, open, onOpenChange }: PaymentHistoryDialogProps) {
  const { isAdmin } = useIsAdmin();
  const { data: transactions, isLoading } = usePaymentTransactions(open ? payment?.id : undefined);
  const { preview, loadingId, openReceipt, openStatement, refreshPreview, closePreview } = usePdfPreview();
  const deleteTransaction = useDeletePaymentTransaction();
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<PaymentTransaction | null>(null);
  const [undoingTransaction, setUndoingTransaction] = useState<PaymentTransaction | null>(null);

  const recorderIds = Array.from(new Set((transactions || []).map((t) => t.created_by).filter(Boolean))) as string[];
  const { data: recorderProfiles } = useQuery({
    queryKey: ["profiles", "for-transactions", recorderIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", recorderIds);
      if (error) throw error;
      return data;
    },
    enabled: recorderIds.length > 0,
  });
  const recorderName = (userId: string | null) =>
    userId ? recorderProfiles?.find((p) => p.user_id === userId)?.full_name || "Unknown user" : null;

  const totalDue = payment?.amount || 0;
  const totalReceived = (transactions || []).reduce((s, t) => s + Number(t.amount), 0);
  const balance = totalDue - totalReceived;

  const handleInstallmentReceipt = (transactionId: string) => {
    if (!payment) return;
    openReceipt(payment.id, transactionId).catch((err: Error) =>
      toast.error("Couldn't open receipt: " + err.message)
    );
  };

  const handleStatement = () => {
    if (!payment) return;
    openStatement(payment.id).catch((err: Error) =>
      toast.error("Couldn't open statement: " + err.message)
    );
  };

  const handleConfirmUndo = async () => {
    if (!undoingTransaction) return;
    try {
      await deleteTransaction.mutateAsync({
        id: undoingTransaction.id,
        rent_payment_id: undoingTransaction.rent_payment_id,
      });
      toast.success("Receipt undone — the payment's totals have been recalculated.");
    } catch (err) {
      toast.error("Failed to undo receipt: " + (err as Error).message);
    } finally {
      setUndoingTransaction(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payment History</DialogTitle>
            <DialogDescription>
              {payment?.tenant?.name} — rent for{" "}
              {payment?.billing_month
                ? format(new Date(payment.billing_month + "-01"), "MMMM yyyy")
                : payment?.due_date
                  ? format(new Date(payment.due_date), "MMMM yyyy")
                  : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg bg-secondary/50 p-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Due</span>
              <span className="font-semibold">{formatINR(totalDue)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Received</span>
              <span className="font-semibold text-success">{formatINR(totalReceived)}</span>
            </div>
            <div className="flex justify-between border-t border-white/10 pt-1.5">
              <span className="text-muted-foreground font-medium">Balance</span>
              <span className={balance > 0 ? "font-bold text-primary" : "font-bold text-success"}>
                {formatINR(balance)}
              </span>
            </div>
          </div>

          {isLoading ? (
            <div className="py-6 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !transactions || transactions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No payments recorded against this rent yet.
            </p>
          ) : (
            <div className="space-y-2">
              {transactions.map((t, i) => (
                <div key={t.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {formatINR(Number(t.amount))}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          Payment {i + 1}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(t.paid_date), "PPP")}
                        {t.payment_method ? ` · ${methodLabels[t.payment_method] || t.payment_method}` : ""}
                      </p>
                      {recorderName(t.created_by) && (
                        <p className="text-xs text-muted-foreground">
                          Recorded by {recorderName(t.created_by)} on {formatIST(t.created_at)}
                        </p>
                      )}
                      {(Number(t.tds_amount) > 0 || Number(t.gst_amount) > 0) && (
                        <p className="text-xs text-muted-foreground">
                          {Number(t.gst_amount) > 0 && `GST: +${formatINR(Number(t.gst_amount))} · `}
                          {Number(t.tds_amount) > 0 && `TDS: -${formatINR(Number(t.tds_amount))} · `}
                          Received: {formatINR(Number(t.received_amount))}
                        </p>
                      )}
                      {Number(t.gst_pending_amount) > 0 && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          GST Pending: {formatINR(Number(t.gst_pending_amount))} (not collected with this payment)
                        </p>
                      )}
                      {t.notes && <p className="text-xs text-muted-foreground mt-1">{t.notes}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleInstallmentReceipt(t.id)}
                        disabled={loadingId === payment?.id}
                      >
                        {loadingId === payment?.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Receipt className="h-4 w-4 mr-1" />
                            Receipt
                          </>
                        )}
                      </Button>
                      {isAdmin && (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Edit this receipt"
                            onClick={() => setEditingTransaction(t)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Undo this receipt"
                            onClick={() => setUndoingTransaction(t)}
                          >
                            <Undo2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {transactions && transactions.length > 0 && (
            <Button variant="outline" onClick={handleStatement} disabled={loadingId === payment?.id}>
              <FileText className="h-4 w-4 mr-2" />
              Download Full Statement
            </Button>
          )}

          <Button variant="ghost" size="sm" onClick={() => setShowFullHistory((v) => !v)}>
            <History className="h-4 w-4 mr-2" />
            {showFullHistory ? "Hide" : "Show"} full record history
          </Button>
          {showFullHistory && (
            <div className="pt-1">
              <ActivityLogList
                entityType="rent_payments"
                entityId={payment?.id}
                emptyLabel="No changes recorded on this payment record yet."
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <PdfPreviewDialog preview={preview} onClose={closePreview} onRefresh={refreshPreview} />

      <EditPaymentTransactionDialog
        transaction={editingTransaction}
        open={!!editingTransaction}
        onOpenChange={(o) => !o && setEditingTransaction(null)}
      />

      <AlertDialog open={!!undoingTransaction} onOpenChange={(o) => !o && setUndoingTransaction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo This Receipt?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes just this one installment
              {undoingTransaction ? ` (${formatINR(Number(undoingTransaction.amount))}, ${format(new Date(undoingTransaction.paid_date), "PPP")})` : ""}
              . The payment's total received and status are recalculated from whatever's left —
              every other installment recorded against this month's rent is untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmUndo}>Undo Receipt</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Receipt, FileText, Loader2 } from "lucide-react";
import { RentPayment } from "@/hooks/usePayments";
import { usePaymentTransactions } from "@/hooks/usePaymentTransactions";
import { usePdfPreview } from "@/hooks/usePdfPreview";
import { PdfPreviewDialog } from "@/components/payments/PdfPreviewDialog";
import { formatINR } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
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
  const { data: transactions, isLoading } = usePaymentTransactions(open ? payment?.id : undefined);
  const { preview, loadingId, openReceipt, openStatement, refreshPreview, closePreview } = usePdfPreview();

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
                          Recorded by {recorderName(t.created_by)}
                        </p>
                      )}
                      {Number(t.tds_amount) > 0 && (
                        <p className="text-xs text-muted-foreground">
                          TDS: {formatINR(Number(t.tds_amount))} · Received: {formatINR(Number(t.received_amount))}
                        </p>
                      )}
                      {t.notes && <p className="text-xs text-muted-foreground mt-1">{t.notes}</p>}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
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
        </DialogContent>
      </Dialog>

      <PdfPreviewDialog preview={preview} onClose={closePreview} onRefresh={refreshPreview} />
    </>
  );
}

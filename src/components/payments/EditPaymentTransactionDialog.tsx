import { useEffect, useState } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/currency";
import { PaymentTransaction, useUpdatePaymentTransaction } from "@/hooks/usePaymentTransactions";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { UnsavedChangesAlert } from "@/components/ui/unsaved-changes-alert";
import { toast } from "sonner";

interface EditPaymentTransactionDialogProps {
  transaction: PaymentTransaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const paymentMethods = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "upi", label: "UPI" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];

export function EditPaymentTransactionDialog({ transaction, open, onOpenChange }: EditPaymentTransactionDialogProps) {
  const updateTransaction = useUpdatePaymentTransaction();
  const [amount, setAmount] = useState("");
  const [tdsAmount, setTdsAmount] = useState("");
  const [gstAmount, setGstAmount] = useState("");
  const [paidDate, setPaidDate] = useState<Date | undefined>();
  const [paymentMethod, setPaymentMethod] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open || !transaction) return;
    setAmount(String(transaction.amount));
    setTdsAmount(String(transaction.tds_amount || 0));
    setGstAmount(String(transaction.gst_amount || 0));
    setPaidDate(new Date(transaction.paid_date));
    setPaymentMethod(transaction.payment_method || "");
    setNotes(transaction.notes || "");
  }, [open, transaction]);

  const amountNum = parseFloat(amount) || 0;
  const tdsNum = parseFloat(tdsAmount) || 0;
  const gstNum = parseFloat(gstAmount) || 0;
  const receivedAmount = amountNum + gstNum - tdsNum;

  const handleSave = async () => {
    if (!transaction) return;
    if (amountNum <= 0) {
      toast.error("Amount must be greater than 0");
      return;
    }
    if (tdsNum < 0 || tdsNum > amountNum) {
      toast.error("TDS amount must be between 0 and the amount");
      return;
    }
    if (gstNum < 0) {
      toast.error("GST amount cannot be negative");
      return;
    }
    if (!paidDate) {
      toast.error("Paid date is required");
      return;
    }

    try {
      await updateTransaction.mutateAsync({
        id: transaction.id,
        rent_payment_id: transaction.rent_payment_id,
        amount: amountNum,
        tds_amount: tdsNum,
        gst_amount: gstNum,
        paid_date: format(paidDate, "yyyy-MM-dd"),
        payment_method: paymentMethod || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success("Receipt updated!");
      onOpenChange(false);
    } catch (err) {
      toast.error("Failed to update receipt: " + (err as Error).message);
    }
  };

  const isDirty =
    !!transaction &&
    (amount !== String(transaction.amount) ||
      tdsAmount !== String(transaction.tds_amount || 0) ||
      gstAmount !== String(transaction.gst_amount || 0) ||
      (paidDate ? format(paidDate, "yyyy-MM-dd") : "") !== transaction.paid_date ||
      paymentMethod !== (transaction.payment_method || "") ||
      notes !== (transaction.notes || ""));
  const { guardedOnOpenChange, pendingClose, confirmDiscard, cancelDiscard } =
    useUnsavedChangesGuard(isDirty, onOpenChange);

  return (
    <>
      <Dialog open={open} onOpenChange={guardedOnOpenChange}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit This Receipt</DialogTitle>
            <DialogDescription>
              Admin-only. Corrects just this one installment — the payment's totals are
              recalculated automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Amount (₹)</Label>
                <Input type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>GST Amount (₹)</Label>
                <Input type="number" step="any" value={gstAmount} onChange={(e) => setGstAmount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>TDS Amount (₹)</Label>
                <Input type="number" step="any" value={tdsAmount} onChange={(e) => setTdsAmount(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              Received amount (Amount + GST − TDS): {formatINR(receivedAmount)}
            </p>

            <div className="space-y-2">
              <Label>Paid Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full pl-3 text-left font-normal", !paidDate && "text-muted-foreground")}
                  >
                    {paidDate ? format(paidDate, "PP") : <span>Pick a date</span>}
                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={paidDate} onSelect={setPaidDate} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((method) => (
                    <SelectItem key={method.value} value={method.value}>{method.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => guardedOnOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={updateTransaction.isPending}>
              {updateTransaction.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <UnsavedChangesAlert open={pendingClose} onConfirm={confirmDiscard} onCancel={cancelDiscard} />
    </>
  );
}

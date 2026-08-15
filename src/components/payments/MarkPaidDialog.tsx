import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarIcon, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { RentPayment, useMarkPaymentPaid } from "@/hooks/usePayments";
import { useCreatePaymentTransaction } from "@/hooks/usePaymentTransactions";
import { formatINR } from "@/lib/currency";
import { usePdfPreview } from "@/hooks/usePdfPreview";
import { PdfPreviewDialog } from "@/components/payments/PdfPreviewDialog";
import { toast } from "sonner";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { UnsavedChangesAlert } from "@/components/ui/unsaved-changes-alert";
import { settlementFromGross, settlementFromReceived, looksLikeGstPending } from "@/lib/paymentMath";
import { Checkbox } from "@/components/ui/checkbox";

interface MarkPaidDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: RentPayment | null;
}

const paymentMethods = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "upi", label: "UPI" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];


export const MarkPaidDialog = ({ open, onOpenChange, payment }: MarkPaidDialogProps) => {
  const [paidDate, setPaidDate] = useState<Date>(new Date());
  const [paymentMethod, setPaymentMethod] = useState<string>("bank_transfer");
  const [notes, setNotes] = useState("");
  const [paymentType, setPaymentType] = useState<"full" | "partial">("full");
  const [partialAmount, setPartialAmount] = useState("");
  const [tdsApplicable, setTdsApplicable] = useState(false);
  // When a partial receipt looks like "full rent minus TDS, no GST", we assume GST is
  // pending by default — this flips that assumption off if the user says GST really was
  // included and the match was just a coincidence.
  const [gstIncludedOverride, setGstIncludedOverride] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const markPaid = useMarkPaymentPaid();
  const createTransaction = useCreatePaymentTransaction();
  const { preview, openReceipt, refreshPreview, closePreview } = usePdfPreview();

  // Default the TDS toggle from the tenant's preference each time the dialog opens
  useEffect(() => {
    if (open) {
      setTdsApplicable(payment?.tenant?.tds_applicable || false);
      setGstIncludedOverride(false);
    }
  }, [open, payment?.id]);

  // Not a toggle — GST either applies to this tenant's invoices or it doesn't, per the
  // tenant's own GST setting. No manual override here.
  const gstApplicable = payment?.tenant?.requires_gst || false;

  const totalDue = payment?.amount || 0;
  const previouslyPaid = payment?.paid_amount || 0;
  const remainingDue = totalDue - previouslyPaid;

  // "Full Amount" clears the exact remaining due, so its rent portion is known outright.
  // "Partial Amount" instead takes the actual cash the person received — what they can
  // read off their bank statement — and works BACKWARD to the rent portion it clears,
  // since that's what rent_payments.paid_amount tracks against. Solving it the other way
  // (asking the user for a pre-GST/TDS rent figure) would ask them to do arithmetic they
  // don't have the inputs for.
  const fullSettlement = settlementFromGross(remainingDue, tdsApplicable, gstApplicable);
  const fullAmountNet = fullSettlement.receivedAmount;

  const partialReceived = parseFloat(partialAmount) || 0;

  // Common real-world pattern: a tenant pays the full rent net of TDS on time but settles
  // GST separately/later. If a partial receipt lands within 1% of exactly that figure,
  // assume that's what happened rather than treating it as a smaller, GST-inclusive
  // partial payment — the user can say otherwise via the override below.
  const gstPendingDetected =
    paymentType === "partial" && gstApplicable && looksLikeGstPending(partialReceived, tdsApplicable, remainingDue);
  const treatGstAsPending = gstPendingDetected && !gstIncludedOverride;

  const settlement =
    paymentType === "full"
      ? fullSettlement
      : treatGstAsPending
        ? settlementFromGross(remainingDue, tdsApplicable, false)
        : settlementFromReceived(partialReceived, tdsApplicable, gstApplicable);

  const { grossSettled, tdsAmount, gstAmount, receivedAmount } = settlement;
  const gstPendingAmount = treatGstAsPending ? settlementFromGross(remainingDue, false, true).gstAmount : 0;
  const newTotalPaid = previouslyPaid + grossSettled;
  const isFullyPaid = newTotalPaid >= totalDue;

  const handleSubmit = async () => {
    // Guards the whole submission, not just one of its two sequential mutations — a second
    // click while the first is still creating the transaction (before markPaid even starts,
    // so markPaid.isPending is still false) would otherwise record the same payment twice.
    if (!payment || isSubmitting) return;

    if (paymentType === "partial" && (grossSettled <= 0 || grossSettled > remainingDue)) {
      toast.error(`Please enter an amount received between ₹1 and ${formatINR(fullAmountNet)} (the maximum receivable against the remaining rent due)`);
      return;
    }

    setIsSubmitting(true);
    try {
      // Record THIS installment as its own history entry first, so nothing is lost even if the
      // running-total update below fails. Each entry keeps its own date/amount/method.
      let transactionId: string | undefined;
      try {
        const txn = await createTransaction.mutateAsync({
          rent_payment_id: payment.id,
          amount: grossSettled,
          tds_amount: tdsAmount,
          gst_amount: gstAmount,
          gst_pending_amount: gstPendingAmount,
          received_amount: receivedAmount,
          paid_date: format(paidDate, "yyyy-MM-dd"),
          payment_method: paymentMethod,
          notes: notes.trim() || undefined,
        });
        transactionId = txn.id;
      } catch (err) {
        console.error("Failed to record payment installment:", err);
        toast.error("Failed to record payment: " + (err as Error).message);
        return;
      }

      await markPaid.mutateAsync({
        id: payment.id,
        paid_date: format(paidDate, "yyyy-MM-dd"),
        payment_method: paymentMethod,
        notes: notes.trim() || undefined,
        paid_amount: newTotalPaid,
        status: isFullyPaid ? "paid" : "partial",
        tds_applicable: tdsApplicable,
        tds_amount: tdsAmount,
        gst_applicable: gstApplicable,
        gst_amount: gstAmount,
        gst_pending_amount: gstPendingAmount,
      });

      // Generate a receipt for THIS installment specifically.
      try {
        await openReceipt(payment.id, transactionId);
        toast.success("Payment recorded!");
      } catch (err: any) {
        console.error("Receipt generation error:", err);
        toast.info("Payment recorded. Receipt could not be generated.");
      }

      onOpenChange(false);
      resetForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setPaidDate(new Date());
    setPaymentMethod("bank_transfer");
    setNotes("");
    setPaymentType("full");
    setPartialAmount("");
    setTdsApplicable(false);
    setGstIncludedOverride(false);
  };

  const isDirty =
    notes.trim() !== "" ||
    partialAmount !== "" ||
    paymentMethod !== "bank_transfer" ||
    paymentType !== "full" ||
    tdsApplicable !== (payment?.tenant?.tds_applicable || false) ||
    format(paidDate, "yyyy-MM-dd") !== format(new Date(), "yyyy-MM-dd");
  const { guardedOnOpenChange, pendingClose, confirmDiscard, cancelDiscard } =
    useUnsavedChangesGuard(isDirty, onOpenChange);

  return (
    <>
    {payment && (
    <Dialog open={open} onOpenChange={guardedOnOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>
            Record payment from {payment.tenant?.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Amount Summary */}
          <div className="rounded-lg bg-secondary/50 p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Due</span>
              <span className="font-semibold">{formatINR(totalDue)}</span>
            </div>
            {previouslyPaid > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Previously Received</span>
                <span className="font-semibold text-success">{formatINR(previouslyPaid)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm border-t border-white/10 pt-2">
              <span className="text-muted-foreground font-medium">Remaining</span>
              <span className="font-bold text-primary">{formatINR(remainingDue)}</span>
            </div>
          </div>

          {/* GST notice — not a toggle, follows the tenant's own GST setting */}
          {gstApplicable && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
              This tenant is registered for GST, so 18% GST (9% CGST + 9% SGST) is added on top of rent automatically, as on their invoices.
            </div>
          )}

          {/* TDS Toggle */}
          <div className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
            <div className="space-y-0.5">
              <Label>TDS Applicable</Label>
              <p className="text-xs text-muted-foreground">
                Tenant deducts 10% TDS from rent before paying
              </p>
            </div>
            <Switch checked={tdsApplicable} onCheckedChange={setTdsApplicable} />
          </div>

          {/* Full / Partial Selection */}
          <div className="space-y-2">
            <Label>Amount Received</Label>
            <RadioGroup
              value={paymentType}
              onValueChange={(v) => setPaymentType(v as "full" | "partial")}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="full" id="full" />
                <Label htmlFor="full" className="font-normal cursor-pointer">
                  Full Amount ({formatINR(fullAmountNet)})
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="partial" id="partial" />
                <Label htmlFor="partial" className="font-normal cursor-pointer">
                  Partial Amount
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Partial Amount Input */}
          {paymentType === "partial" && (
            <div className="space-y-2">
              <Label>Amount Received (₹)</Label>
              <Input
                type="number"
                placeholder={`Max ${fullAmountNet}`}
                value={partialAmount}
                onChange={(e) => setPartialAmount(e.target.value)}
                max={fullAmountNet}
                min={1}
              />
              <p className="text-xs text-muted-foreground">
                Enter the actual amount that landed in your account — we'll work out how much of the rent due that clears.
              </p>
              {grossSettled > 0 && grossSettled <= remainingDue && (
                <p className="text-xs text-muted-foreground">
                  Balance after this payment: {formatINR(remainingDue - grossSettled)}
                </p>
              )}
            </div>
          )}

          {/* GST-pending detection — a partial receipt that looks like full rent net of
              TDS but with no GST added */}
          {gstPendingDetected && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
              <div className="flex gap-2 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>
                  This looks like the full rent{tdsApplicable ? " (net of TDS)" : ""} without GST. We're recording the
                  rent as fully settled and TDS as accounted for, with GST tracked as pending separately.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="gst-included-override"
                  checked={gstIncludedOverride}
                  onCheckedChange={(v) => setGstIncludedOverride(v === true)}
                />
                <Label htmlFor="gst-included-override" className="font-normal cursor-pointer text-xs">
                  Actually, GST was included in this payment
                </Label>
              </div>
            </div>
          )}

          {/* GST / TDS Breakup */}
          {(tdsApplicable || gstApplicable) && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Rent Due</span>
                <span className="font-semibold">{formatINR(remainingDue)}</span>
              </div>
              {paymentType === "partial" && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Rent Being Cleared</span>
                  <span className="font-semibold">{formatINR(grossSettled)}</span>
                </div>
              )}
              {gstApplicable && !treatGstAsPending && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Add: GST (18%)</span>
                  <span className="font-semibold text-success">+ {formatINR(gstAmount)}</span>
                </div>
              )}
              {treatGstAsPending && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">GST Pending (not collected)</span>
                  <span className="font-semibold text-amber-600 dark:text-amber-400">{formatINR(gstPendingAmount)}</span>
                </div>
              )}
              {tdsApplicable && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Less: TDS Deducted (10%)</span>
                  <span className="font-semibold text-destructive">- {formatINR(tdsAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm border-t border-border pt-2">
                <span className="text-muted-foreground font-medium">Net Amount Receivable</span>
                <span className="font-bold text-primary">{formatINR(receivedAmount)}</span>
              </div>
            </div>
          )}

          {/* Date */}
          <div className="space-y-2">
            <Label>Date Received</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !paidDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {paidDate ? format(paidDate, "PPP") : "Select date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={paidDate}
                  onSelect={(date) => date && setPaidDate(date)}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Payment Method */}
          <div className="space-y-2">
            <Label>Payment Method</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger>
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                {paymentMethods.map((method) => (
                  <SelectItem key={method.value} value={method.value}>
                    {method.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Comments (Optional)</Label>
            <Textarea
              placeholder="Add any notes about this payment..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => guardedOnOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || (paymentType === "partial" && (grossSettled <= 0 || grossSettled > remainingDue))}
          >
            {isSubmitting ? "Saving..." : `Record ${formatINR(receivedAmount)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    )}

    <PdfPreviewDialog preview={preview} onClose={closePreview} onRefresh={refreshPreview} />
    <UnsavedChangesAlert open={pendingClose} onConfirm={confirmDiscard} onCancel={cancelDiscard} />
    </>
  );
};

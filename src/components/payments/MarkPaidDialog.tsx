import { useState } from "react";
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
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { RentPayment, useMarkPaymentPaid } from "@/hooks/usePayments";
import { formatINR } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

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

const openBase64Pdf = (base64: string) => {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
};

export const MarkPaidDialog = ({ open, onOpenChange, payment }: MarkPaidDialogProps) => {
  const [paidDate, setPaidDate] = useState<Date>(new Date());
  const [paymentMethod, setPaymentMethod] = useState<string>("bank_transfer");
  const [notes, setNotes] = useState("");
  const [paymentType, setPaymentType] = useState<"full" | "partial">("full");
  const [partialAmount, setPartialAmount] = useState("");
  const markPaid = useMarkPaymentPaid();

  const totalDue = payment?.amount || 0;
  const previouslyPaid = (payment as any)?.paid_amount || 0;
  const remainingDue = totalDue - previouslyPaid;

  const receivedAmount = paymentType === "full" ? remainingDue : parseFloat(partialAmount) || 0;
  const newTotalPaid = previouslyPaid + receivedAmount;
  const isFullyPaid = newTotalPaid >= totalDue;

  const handleSubmit = async () => {
    if (!payment) return;

    if (paymentType === "partial" && (receivedAmount <= 0 || receivedAmount > remainingDue)) {
      toast.error(`Please enter an amount between 1 and ${formatINR(remainingDue)}`);
      return;
    }

    await markPaid.mutateAsync({
      id: payment.id,
      paid_date: format(paidDate, "yyyy-MM-dd"),
      payment_method: paymentMethod,
      notes: notes.trim() || undefined,
      paid_amount: newTotalPaid,
      status: isFullyPaid ? "paid" : "partial",
    });

    // Generate receipt for the payment
    try {
      const { data, error } = await supabase.functions.invoke("generate-receipt-pdf", {
        body: { paymentId: payment.id },
      });

      if (error) throw error;
      openBase64Pdf(data.pdf);
      toast.success("Payment recorded & receipt opened!");
    } catch (err: any) {
      console.error("Receipt generation error:", err);
      toast.info("Payment recorded. Receipt could not be generated.");
    }

    onOpenChange(false);
    resetForm();
  };

  const resetForm = () => {
    setPaidDate(new Date());
    setPaymentMethod("bank_transfer");
    setNotes("");
    setPaymentType("full");
    setPartialAmount("");
  };

  if (!payment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
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
                <span className="font-semibold text-green-500">{formatINR(previouslyPaid)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm border-t border-white/10 pt-2">
              <span className="text-muted-foreground font-medium">Remaining</span>
              <span className="font-bold text-primary">{formatINR(remainingDue)}</span>
            </div>
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
                  Full Amount ({formatINR(remainingDue)})
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
                placeholder={`Max ${remainingDue}`}
                value={partialAmount}
                onChange={(e) => setPartialAmount(e.target.value)}
                max={remainingDue}
                min={1}
              />
              {receivedAmount > 0 && receivedAmount <= remainingDue && (
                <p className="text-xs text-muted-foreground">
                  Balance after this payment: {formatINR(remainingDue - receivedAmount)}
                </p>
              )}
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={markPaid.isPending || (paymentType === "partial" && (receivedAmount <= 0 || receivedAmount > remainingDue))}
          >
            {markPaid.isPending ? "Saving..." : `Record ${formatINR(receivedAmount)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

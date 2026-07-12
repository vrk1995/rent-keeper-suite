import { useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
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
import { Separator } from "@/components/ui/separator";
import { CalendarIcon, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminUpdatePayment } from "@/hooks/usePayments";
import { useUpdateInvoice } from "@/hooks/useInvoices";
import { toast } from "sonner";

interface EditPaymentDialogProps {
  paymentId: string | null;
  invoiceId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful save, e.g. to regenerate a PDF preview showing the old data. */
  onSaved?: () => Promise<void>;
}

interface FormState {
  amount: string;
  due_date: Date | undefined;
  paid_date: Date | undefined;
  payment_method: string;
  notes: string;
  invoice_number: string;
  invoice_status: string;
}

const EMPTY_FORM: FormState = {
  amount: "",
  due_date: undefined,
  paid_date: undefined,
  payment_method: "",
  notes: "",
  invoice_number: "",
  invoice_status: "draft",
};

const paymentMethods = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "upi", label: "UPI" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];

export function EditPaymentDialog({ paymentId, invoiceId, open, onOpenChange, onSaved }: EditPaymentDialogProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const updatePayment = useAdminUpdatePayment();
  const updateInvoice = useUpdateInvoice();

  useEffect(() => {
    if (!open || !paymentId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: payment, error: paymentError } = await supabase
          .from("rent_payments")
          .select("amount, due_date, paid_date, payment_method, notes")
          .eq("id", paymentId)
          .single();

        if (cancelled) return;
        if (paymentError) {
          toast.error("Failed to load payment: " + paymentError.message);
          return;
        }

        let invoiceFields: Partial<FormState> = {};
        if (invoiceId) {
          const { data: invoice, error: invoiceError } = await supabase
            .from("invoices")
            .select("invoice_number, status")
            .eq("id", invoiceId)
            .single();
          if (!cancelled && !invoiceError && invoice) {
            invoiceFields = { invoice_number: invoice.invoice_number, invoice_status: invoice.status || "draft" };
          }
        }

        if (payment) {
          setForm({
            amount: String(payment.amount),
            due_date: new Date(payment.due_date),
            paid_date: payment.paid_date ? new Date(payment.paid_date) : undefined,
            payment_method: payment.payment_method || "",
            notes: payment.notes || "",
            invoice_number: invoiceFields.invoice_number || "",
            invoice_status: invoiceFields.invoice_status || "draft",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, paymentId, invoiceId]);

  const handleSave = async () => {
    if (!paymentId) return;

    const amountNum = parseFloat(form.amount);
    if (isNaN(amountNum) || amountNum < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (!form.due_date) {
      toast.error("Due date is required");
      return;
    }
    if (invoiceId && !form.invoice_number.trim()) {
      toast.error("Invoice number is required");
      return;
    }

    try {
      await updatePayment.mutateAsync({
        id: paymentId,
        amount: amountNum,
        due_date: format(form.due_date, "yyyy-MM-dd"),
        paid_date: form.paid_date ? format(form.paid_date, "yyyy-MM-dd") : null,
        payment_method: form.payment_method || null,
        notes: form.notes.trim() || null,
      });

      if (invoiceId) {
        // Keep the invoice's amount/due date in sync with the payment so the two never
        // drift apart — invoices are matched to payments by these fields, not a foreign
        // key, so letting them diverge breaks that match the next time the PDF is opened.
        await updateInvoice.mutateAsync({
          id: invoiceId,
          invoice_number: form.invoice_number.trim(),
          status: form.invoice_status,
          amount: amountNum,
          due_date: format(form.due_date, "yyyy-MM-dd"),
        });
      }

      toast.success(invoiceId ? "Payment and invoice updated!" : "Payment updated!");

      if (onSaved) {
        setRefreshing(true);
        try {
          await onSaved();
        } catch (err: any) {
          toast.error("Saved, but couldn't refresh the preview: " + err.message);
        } finally {
          setRefreshing(false);
        }
      }

      onOpenChange(false);
    } catch {
      // Individual mutations already surfaced their own error toast.
    }
  };

  const isSaving = updatePayment.isPending || updateInvoice.isPending || refreshing;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Payment{invoiceId ? " & Invoice" : ""}</DialogTitle>
          <DialogDescription>Admin-only. Changes save directly to the database.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {invoiceId && (
              <>
                <div className="space-y-2">
                  <Label>Invoice Number</Label>
                  <Input
                    value={form.invoice_number}
                    onChange={(e) => setForm((f) => ({ ...f, invoice_number: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Invoice Status</Label>
                  <Select
                    value={form.invoice_status}
                    onValueChange={(v) => setForm((f) => ({ ...f, invoice_status: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="sent">Sent</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Separator />
              </>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Amount (₹)</Label>
                <Input
                  type="number"
                  step="any"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full pl-3 text-left font-normal",
                        !form.due_date && "text-muted-foreground"
                      )}
                    >
                      {form.due_date ? format(form.due_date, "PP") : <span>Pick a date</span>}
                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={form.due_date}
                      onSelect={(date) => setForm((f) => ({ ...f, due_date: date }))}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Paid / Receipt Date</Label>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full pl-3 text-left font-normal",
                        !form.paid_date && "text-muted-foreground"
                      )}
                    >
                      {form.paid_date ? format(form.paid_date, "PP") : <span>Not paid yet</span>}
                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={form.paid_date}
                      onSelect={(date) => setForm((f) => ({ ...f, paid_date: date }))}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
                {form.paid_date && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Clear paid date"
                    onClick={() => setForm((f) => ({ ...f, paid_date: undefined }))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                This is the date shown as the receipt date on the generated receipt PDF.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select
                value={form.payment_method}
                onValueChange={(v) => setForm((f) => ({ ...f, payment_method: v }))}
              >
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

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading || isSaving}>
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

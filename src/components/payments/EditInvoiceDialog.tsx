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
import { CalendarIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUpdateInvoice } from "@/hooks/useInvoices";
import { toast } from "sonner";

interface EditInvoiceDialogProps {
  invoiceId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface InvoiceFormState {
  invoice_number: string;
  amount: string;
  due_date: Date | undefined;
  status: string;
  notes: string;
}

const EMPTY_FORM: InvoiceFormState = {
  invoice_number: "",
  amount: "",
  due_date: undefined,
  status: "draft",
  notes: "",
};

export function EditInvoiceDialog({ invoiceId, open, onOpenChange }: EditInvoiceDialogProps) {
  const [form, setForm] = useState<InvoiceFormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const updateInvoice = useUpdateInvoice();

  useEffect(() => {
    if (!open || !invoiceId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("invoices")
          .select("invoice_number, amount, due_date, status, notes")
          .eq("id", invoiceId)
          .single();

        if (cancelled) return;
        if (error) {
          toast.error("Failed to load invoice: " + error.message);
          return;
        }
        if (data) {
          setForm({
            invoice_number: data.invoice_number,
            amount: String(data.amount),
            due_date: new Date(data.due_date),
            status: data.status || "draft",
            notes: data.notes || "",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, invoiceId]);

  const handleSave = async () => {
    if (!invoiceId) return;
    if (!form.invoice_number.trim()) {
      toast.error("Invoice number is required");
      return;
    }
    const amountNum = parseFloat(form.amount);
    if (isNaN(amountNum) || amountNum < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (!form.due_date) {
      toast.error("Due date is required");
      return;
    }

    await updateInvoice.mutateAsync({
      id: invoiceId,
      invoice_number: form.invoice_number.trim(),
      amount: amountNum,
      due_date: format(form.due_date, "yyyy-MM-dd"),
      status: form.status,
      notes: form.notes.trim() || null,
    });

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Invoice</DialogTitle>
          <DialogDescription>Admin-only. Changes save directly to the invoice record.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Invoice Number</Label>
              <Input
                value={form.invoice_number}
                onChange={(e) => setForm((f) => ({ ...f, invoice_number: e.target.value }))}
              />
            </div>
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
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
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
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Amount and due date here only correct this invoice record — they don't change
              the tenant's rent-due amount or ledger, which are tracked on the underlying
              payment.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading || updateInvoice.isPending}>
            {updateInvoice.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

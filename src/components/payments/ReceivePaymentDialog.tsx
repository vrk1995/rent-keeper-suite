import { useEffect, useMemo, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatINR } from "@/lib/currency";
import { useTenants } from "@/hooks/useTenants";
import { useOutstandingPaymentsForTenant, RentPayment } from "@/hooks/usePayments";
import { useReconcilePayment } from "@/hooks/useReconcilePayment";

const paymentMethods = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "upi", label: "UPI" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];

const round2 = (n: number) => Math.round(n * 100) / 100;

const monthLabel = (p: RentPayment) => {
  if (p.billing_month) {
    const [y, m] = p.billing_month.split("-");
    return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
  }
  return format(new Date(p.due_date), "MMM yyyy");
};

interface ReceivePaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-selected when opened from a specific tenant's page; otherwise the user picks one. */
  tenantId?: string;
}

export const ReceivePaymentDialog = ({ open, onOpenChange, tenantId }: ReceivePaymentDialogProps) => {
  const { data: allTenants } = useTenants();
  const [selectedTenantId, setSelectedTenantId] = useState(tenantId || "");
  const { data: outstanding, isLoading: outstandingLoading } = useOutstandingPaymentsForTenant(selectedTenantId || undefined);
  const reconcile = useReconcilePayment();

  const [paidDate, setPaidDate] = useState<Date>(new Date());
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [notes, setNotes] = useState("");
  const [tdsApplicable, setTdsApplicable] = useState(false);
  const [mode, setMode] = useState<"fifo" | "lifo" | "custom">("fifo");
  const [amountReceived, setAmountReceived] = useState("");
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});

  // Reset the form each time the dialog is opened fresh.
  useEffect(() => {
    if (!open) return;
    setSelectedTenantId(tenantId || "");
    setPaidDate(new Date());
    setPaymentMethod("bank_transfer");
    setNotes("");
    setMode("fifo");
    setAmountReceived("");
    setCustomAmounts({});
  }, [open, tenantId]);

  // Default the TDS toggle from the selected tenant's preference.
  useEffect(() => {
    const tenant = allTenants?.find((t) => t.id === selectedTenantId);
    setTdsApplicable(tenant?.tds_applicable || false);
  }, [selectedTenantId, allTenants]);

  const tenantOptions = useMemo(() => {
    return (allTenants || [])
      .slice()
      .sort((a, b) => (a.status === "vacated" ? 1 : 0) - (b.status === "vacated" ? 1 : 0) || a.name.localeCompare(b.name));
  }, [allTenants]);

  const remainingDue = (p: RentPayment) => round2(p.amount - (p.paid_amount || 0));

  const sortedForMode = useMemo(() => {
    const list = outstanding || [];
    if (mode === "lifo") {
      return [...list].sort((a, b) => new Date(b.due_date).getTime() - new Date(a.due_date).getTime());
    }
    return [...list].sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
  }, [outstanding, mode]);

  // FIFO/LIFO: walk the sorted list, filling each invoice's remaining due before moving on.
  const autoResult = useMemo(() => {
    let remaining = parseFloat(amountReceived) || 0;
    const allocations: { payment: RentPayment; amount: number }[] = [];
    for (const p of sortedForMode) {
      if (remaining <= 0.001) break;
      const due = remainingDue(p);
      if (due <= 0) continue;
      const applied = Math.min(remaining, due);
      allocations.push({ payment: p, amount: round2(applied) });
      remaining -= applied;
    }
    return { allocations, leftover: round2(Math.max(remaining, 0)) };
  }, [amountReceived, sortedForMode]);

  const customAllocations = useMemo(() => {
    return (outstanding || [])
      .map((p) => ({ payment: p, amount: parseFloat(customAmounts[p.id] || "0") || 0 }))
      .filter((a) => a.amount > 0);
  }, [outstanding, customAmounts]);

  const activeAllocations = mode === "custom" ? customAllocations : autoResult.allocations;
  const grossTotal = round2(activeAllocations.reduce((sum, a) => sum + a.amount, 0));
  const tdsTotal = tdsApplicable ? round2(grossTotal * 0.1) : 0;
  const netTotal = round2(grossTotal - tdsTotal);

  const customOverAllocated = mode === "custom" && (outstanding || []).some((p) => {
    const entered = parseFloat(customAmounts[p.id] || "0") || 0;
    return entered > remainingDue(p) + 0.001;
  });

  const canSubmit =
    !!selectedTenantId &&
    activeAllocations.length > 0 &&
    (mode !== "custom" ? autoResult.leftover <= 0.001 : !customOverAllocated);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      const result = await reconcile.mutateAsync({
        paidDate: format(paidDate, "yyyy-MM-dd"),
        paymentMethod,
        notes: notes.trim() || undefined,
        tdsApplicable,
        allocations: activeAllocations.map((a) => ({ rentPaymentId: a.payment.id, amount: a.amount })),
      });
      toast.success(
        `Payment reconciled across ${result.touchedRentPaymentIds.length} invoice${result.touchedRentPaymentIds.length > 1 ? "s" : ""}!`
      );
      onOpenChange(false);
    } catch (err) {
      toast.error("Failed to reconcile payment: " + (err as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Receive Payment</DialogTitle>
          <DialogDescription>
            Record a payment and apply it across one or more outstanding invoices.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!tenantId && (
            <div className="space-y-2">
              <Label>Tenant</Label>
              <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select tenant" />
                </SelectTrigger>
                <SelectContent>
                  {tenantOptions.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}{t.status === "vacated" ? " (Vacated)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {selectedTenantId && (
            <>
              {/* TDS Toggle */}
              <div className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                <div className="space-y-0.5">
                  <Label>TDS Applicable</Label>
                  <p className="text-xs text-muted-foreground">
                    10% TDS is deducted from the gross amount and prorated across the invoices it settles
                  </p>
                </div>
                <Switch checked={tdsApplicable} onCheckedChange={setTdsApplicable} />
              </div>

              {/* Allocation Mode */}
              <div className="space-y-2">
                <Label>Apply Payment</Label>
                <RadioGroup value={mode} onValueChange={(v) => setMode(v as typeof mode)} className="flex gap-4 flex-wrap">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="fifo" id="fifo" />
                    <Label htmlFor="fifo" className="font-normal cursor-pointer">FIFO (oldest first)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="lifo" id="lifo" />
                    <Label htmlFor="lifo" className="font-normal cursor-pointer">LIFO (newest first)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="custom" id="custom" />
                    <Label htmlFor="custom" className="font-normal cursor-pointer">Custom</Label>
                  </div>
                </RadioGroup>
              </div>

              {outstandingLoading ? (
                <p className="text-sm text-muted-foreground">Loading outstanding invoices...</p>
              ) : !outstanding?.length ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  This tenant has no outstanding dues.
                </p>
              ) : mode === "custom" ? (
                <div className="space-y-2">
                  <Label>Invoices to Settle</Label>
                  <div className="space-y-2 rounded-lg border p-3 max-h-64 overflow-y-auto">
                    {outstanding.map((p) => {
                      const due = remainingDue(p);
                      const checked = !!customAmounts[p.id];
                      const entered = parseFloat(customAmounts[p.id] || "0") || 0;
                      const overAllocated = entered > due + 0.001;
                      return (
                        <div key={p.id} className="flex items-center gap-2">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(isChecked) => {
                              setCustomAmounts((prev) => {
                                const next = { ...prev };
                                if (isChecked) next[p.id] = String(due);
                                else delete next[p.id];
                                return next;
                              });
                            }}
                          />
                          <div className="flex-1 text-sm">
                            <span className="font-medium">{monthLabel(p)}</span>
                            <span className="text-muted-foreground ml-2 text-xs">
                              Due {formatINR(due)} of {formatINR(p.amount)}
                            </span>
                          </div>
                          {checked && (
                            <Input
                              type="number"
                              className={cn("w-28 h-8", overAllocated && "border-destructive")}
                              value={customAmounts[p.id] || ""}
                              max={due}
                              min={0.01}
                              onChange={(e) => setCustomAmounts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {customOverAllocated && (
                    <p className="text-xs text-destructive">
                      One or more amounts exceed that invoice's remaining due.
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Amount Received (₹)</Label>
                    <Input
                      type="number"
                      placeholder="e.g. 100000"
                      value={amountReceived}
                      onChange={(e) => setAmountReceived(e.target.value)}
                      min={0.01}
                    />
                  </div>
                  {grossTotal > 0 && (
                    <div className="space-y-1 rounded-lg border p-3 bg-muted/30">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Will be applied to:</p>
                      {autoResult.allocations.map(({ payment, amount }) => (
                        <div key={payment.id} className="flex justify-between text-sm">
                          <span>{monthLabel(payment)}</span>
                          <span>
                            {formatINR(amount)}
                            {amount >= remainingDue(payment) ? " (fully settled)" : " (partial)"}
                          </span>
                        </div>
                      ))}
                      {autoResult.leftover > 0.001 && (
                        <p className="text-xs text-destructive pt-1">
                          {formatINR(autoResult.leftover)} could not be allocated — it exceeds this tenant's total outstanding dues. Reduce the amount.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Summary */}
              {grossTotal > 0 && (
                <div className="rounded-lg bg-secondary/50 p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Gross Amount Settled</span>
                    <span className="font-semibold">{formatINR(grossTotal)}</span>
                  </div>
                  {tdsApplicable && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Less: TDS Deducted (10%)</span>
                      <span className="font-semibold text-destructive">- {formatINR(tdsTotal)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm border-t border-white/10 pt-2">
                    <span className="text-muted-foreground font-medium">Net Amount Receivable</span>
                    <span className="font-bold text-primary">{formatINR(netTotal)}</span>
                  </div>
                </div>
              )}

              {/* Date */}
              <div className="space-y-2">
                <Label>Date Received</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !paidDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {paidDate ? format(paidDate, "PPP") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={paidDate} onSelect={(date) => date && setPaidDate(date)} initialFocus className={cn("p-3 pointer-events-auto")} />
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
                      <SelectItem key={method.value} value={method.value}>{method.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label>Comments (Optional)</Label>
                <Textarea placeholder="Add any notes about this payment..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || reconcile.isPending}>
            {reconcile.isPending ? "Reconciling..." : `Reconcile ${grossTotal > 0 ? formatINR(netTotal) : "Payment"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

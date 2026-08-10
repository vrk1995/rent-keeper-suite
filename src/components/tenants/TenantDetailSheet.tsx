import { useState } from "react";
import { format } from "date-fns";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CheckCircle,
  Clock,
  FileText,
  Receipt,
  Loader2,
  Calendar,
  Building2,
  Download,
  Settings,
  CreditCard,
  IndianRupee,
  LogOut,
  History,
  Copy,
  FileSignature,
  Percent,
} from "lucide-react";
import { Tenant } from "@/hooks/useTenants";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatINR } from "@/lib/currency";
import { toast } from "sonner";
import AddTenantDialog from "./AddTenantDialog";
import VacateTenantDialog from "./VacateTenantDialog";
import GenerateRentAgreementDialog from "./GenerateRentAgreementDialog";
import { MarkPaidDialog } from "@/components/payments/MarkPaidDialog";
import { ReceivePaymentDialog } from "@/components/payments/ReceivePaymentDialog";
import { PdfPreviewDialog } from "@/components/payments/PdfPreviewDialog";
import { UndoPaymentButton } from "@/components/payments/UndoPaymentButton";
import { RentPayment } from "@/hooks/usePayments";
import { paymentStatusConfig, invoiceStatusConfig } from "@/lib/statusConfig";
import { usePdfPreview } from "@/hooks/usePdfPreview";
import { useIsAdmin } from "@/hooks/useTeam";
import { ActivityLogList } from "@/components/activity/ActivityLogList";
import { GstTdsLedgerPanel } from "@/components/ledger/GstTdsLedgerPanel";

interface TenantDetailSheetProps {
  tenant: Tenant | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TenantDetailSheet = ({ tenant, open, onOpenChange }: TenantDetailSheetProps) => {
  const { isAdmin } = useIsAdmin();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [vacateDialogOpen, setVacateDialogOpen] = useState(false);
  const [agreementDialogOpen, setAgreementDialogOpen] = useState(false);
  const { preview, loadingId, openInvoice, openReceipt, refreshPreview, closePreview } = usePdfPreview();
  const [markPaidPayment, setMarkPaidPayment] = useState<RentPayment | null>(null);
  const [receivePaymentOpen, setReceivePaymentOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("payments");
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);

  // Fetch payments for this tenant
  const { data: payments } = useQuery({
    queryKey: ["tenant-payments", tenant?.id],
    queryFn: async () => {
      if (!tenant) return [];
      const { data, error } = await supabase
        .from("rent_payments")
        .select(`*, property:properties(name), unit:units(name, building:buildings(name)), tenant:tenants(name)`)
        .eq("tenant_id", tenant.id)
        .order("due_date", { ascending: false });
      if (error) throw error;
      return data as RentPayment[];
    },
    enabled: !!tenant,
  });

  // Fetch invoices for this tenant
  const { data: invoices } = useQuery({
    queryKey: ["tenant-invoices", tenant?.id],
    queryFn: async () => {
      if (!tenant) return [];
      const { data, error } = await supabase
        .from("invoices")
        .select(`*, property:properties(name, address), tenant:tenants(name, email, phone)`)
        .eq("tenant_id", tenant.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!tenant,
  });

  const handleGenerateInvoice = (paymentId: string) => {
    openInvoice(paymentId).catch((error: any) => {
      toast.error("Failed to generate invoice: " + error.message);
    });
  };

  const handleDownloadReceipt = (paymentId: string) => {
    openReceipt(paymentId).catch((error: any) => {
      toast.error("Failed to generate receipt: " + error.message);
    });
  };

  // Invoices aren't directly linked to payments by FK, so match on the same natural
  // key the DB's monthly-payment generator uses to avoid duplicates: property + due date + amount.
  const invoiceNumberByPayment = new Map<string, string>();
  invoices?.forEach((inv) => {
    invoiceNumberByPayment.set(`${inv.property_id}|${inv.due_date}|${Number(inv.amount).toFixed(2)}`, inv.invoice_number);
  });
  const getInvoiceNumber = (p: RentPayment) =>
    invoiceNumberByPayment.get(`${p.property_id}|${p.due_date}|${Number(p.amount).toFixed(2)}`) || "";

  // Build a proper debit/credit ledger: each billing period raises a debit (rent due),
  // and a credit is posted when a payment is recorded against it. Running balance is
  // what the tenant still owes (positive) or has overpaid (negative).
  type LedgerEntry = {
    date: string;
    particulars: string;
    invoiceNumber: string;
    debit: number;
    credit: number;
  };
  const ledgerRows: LedgerEntry[] = [];
  (payments || []).forEach((p) => {
    const monthLabel = p.billing_month
      ? new Date(
          parseInt(p.billing_month.split("-")[0]),
          parseInt(p.billing_month.split("-")[1]) - 1
        ).toLocaleDateString("en-IN", { month: "short", year: "2-digit" })
      : format(new Date(p.due_date), "MMM yy");
    const invoiceNumber = getInvoiceNumber(p);
    ledgerRows.push({
      date: p.due_date,
      particulars: `Rent due — ${monthLabel}`,
      invoiceNumber,
      debit: p.amount,
      credit: 0,
    });
    const paidAmount = p.paid_amount || 0;
    if (paidAmount > 0) {
      ledgerRows.push({
        date: p.paid_date || p.due_date,
        particulars: (() => {
          const notes: string[] = [];
          if (p.gst_applicable && p.gst_amount) notes.push(`+${formatINR(p.gst_amount)} GST`);
          if (p.tds_applicable && p.tds_amount) notes.push(`-${formatINR(p.tds_amount)} TDS`);
          return notes.length ? `Payment received (${notes.join(", ")})` : "Payment received";
        })(),
        invoiceNumber,
        debit: 0,
        credit: paidAmount,
      });
    }
  });
  ledgerRows.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.credit - b.credit
  );
  let runningBalance = 0;
  const ledgerEntries = ledgerRows.map((entry) => {
    runningBalance += entry.debit - entry.credit;
    return { ...entry, balance: runningBalance };
  });

  const handleDownloadLedger = () => {
    if (!ledgerEntries.length || !tenant) return;

    const headers = ["Date", "Particulars", "Invoice #", "Debit", "Credit", "Balance"];
    const rows = ledgerEntries.map((e) => [
      e.date,
      e.particulars,
      e.invoiceNumber,
      e.debit || "",
      e.credit || "",
      e.balance,
    ]);

    rows.push(["", "", "", "", "", ""]);
    rows.push(["", "TOTAL", "", totalDue, totalPaid, totalPending]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.map(v => `"${v}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Ledger_${tenant.name.replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Ledger downloaded!");
  };

  if (!tenant) return null;

  const totalDue = payments?.reduce((s, p) => s + p.amount, 0) || 0;
  const totalPaid = payments?.reduce((s, p) => s + (p.paid_amount || 0), 0) || 0;
  const totalPending = totalDue - totalPaid;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-[700px] w-full overflow-y-auto p-0">
          <SheetHeader
            className="p-6 pb-4 border-b border-border safe-area-top"
            style={{ paddingTop: "max(1.5rem, calc(env(safe-area-inset-top, 0px) + 0.5rem))" }}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <SheetTitle className="text-xl">{tenant.name}</SheetTitle>
                  {tenant.status === "vacated" && (
                    <Badge variant="secondary" className="text-xs">Vacated</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {tenant.unit ? (
                    <span className="flex items-center gap-1">
                      <Building2 className="w-3 h-3" />
                      {tenant.unit.building?.name} - {tenant.unit.name}
                    </span>
                  ) : (
                    tenant.property?.name
                  )}
                </p>
              </div>
              {isAdmin && (
                <div className="flex gap-2">
                  {tenant.status !== "vacated" && (
                    <Button variant="outline" size="sm" onClick={() => setVacateDialogOpen(true)}>
                      <LogOut className="w-4 h-4 mr-1" />
                      Vacate
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setEditDialogOpen(true)}>
                    <Settings className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setCloneDialogOpen(true)}>
                    <Copy className="w-4 h-4 mr-1" />
                    Clone
                  </Button>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-3">
              <Button variant="outline" size="sm" onClick={() => setAgreementDialogOpen(true)}>
                <FileSignature className="w-4 h-4 mr-1" />
                Rent Agreement
              </Button>
              <Button variant="outline" size="sm" onClick={() => setReceivePaymentOpen(true)}>
                <IndianRupee className="w-4 h-4 mr-1" />
                Receive Payment
              </Button>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3 mt-4">
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Monthly Rent</p>
                  <p className="text-lg font-bold text-primary">{formatINR(tenant.monthly_rent || 0)}</p>
                </CardContent>
              </Card>
              <Card className="bg-success/5 border-success/20">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Total Collected</p>
                  <p className="text-lg font-bold text-success">{formatINR(totalPaid)}</p>
                </CardContent>
              </Card>
              <Card className="bg-warning/5 border-warning/20">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Outstanding</p>
                  <p className="text-lg font-bold text-warning">{formatINR(totalPending)}</p>
                </CardContent>
              </Card>
            </div>
          </SheetHeader>

          <div className="p-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-6">
                <TabsTrigger value="payments" className="text-xs sm:text-sm">
                  <CreditCard className="w-3 h-3 mr-1 hidden sm:inline" />
                  Payments
                </TabsTrigger>
                <TabsTrigger value="invoices" className="text-xs sm:text-sm">
                  <FileText className="w-3 h-3 mr-1 hidden sm:inline" />
                  Invoices
                </TabsTrigger>
                <TabsTrigger value="ledger" className="text-xs sm:text-sm">
                  <IndianRupee className="w-3 h-3 mr-1 hidden sm:inline" />
                  Ledger
                </TabsTrigger>
                <TabsTrigger value="gst-tds" className="text-xs sm:text-sm">
                  <Percent className="w-3 h-3 mr-1 hidden sm:inline" />
                  GST/TDS
                </TabsTrigger>
                <TabsTrigger value="config" className="text-xs sm:text-sm">
                  <Settings className="w-3 h-3 mr-1 hidden sm:inline" />
                  Details
                </TabsTrigger>
                <TabsTrigger value="activity" className="text-xs sm:text-sm">
                  <History className="w-3 h-3 mr-1 hidden sm:inline" />
                  Activity
                </TabsTrigger>
              </TabsList>

              {/* Payments Tab */}
              <TabsContent value="payments" className="mt-4 space-y-3">
                {!payments?.length ? (
                  <p className="text-center text-muted-foreground py-8">No payment records yet</p>
                ) : (
                  payments.map((payment) => {
                    const StatusIcon = paymentStatusConfig[payment.status]?.icon || Clock;
                    return (
                      <Card key={payment.id}>
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <Badge variant="outline" className="text-xs font-normal mr-2">
                                <Calendar className="w-3 h-3 mr-1" />
                                {payment.billing_month
                                  ? new Date(parseInt(payment.billing_month.split("-")[0]), parseInt(payment.billing_month.split("-")[1]) - 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
                                  : format(new Date(payment.due_date), "MMM yyyy")}
                              </Badge>
                              <span className="text-sm text-muted-foreground">
                                Due: {format(new Date(payment.due_date), "MMM d, yyyy")}
                              </span>
                            </div>
                            <Badge variant={paymentStatusConfig[payment.status]?.variant || "secondary"}>
                              <StatusIcon className="w-3 h-3 mr-1" />
                              {payment.status}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-semibold">{formatINR(payment.amount)}</span>
                              {(payment as any).paid_amount > 0 && (payment as any).paid_amount < payment.amount && (
                                <span className="text-xs text-muted-foreground ml-2">
                                  (Paid: {formatINR((payment as any).paid_amount)})
                                </span>
                              )}
                            </div>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleGenerateInvoice(payment.id)} disabled={loadingId === payment.id}>
                                {loadingId === payment.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3 mr-1" />}
                                Invoice
                              </Button>
                              {(payment.status === "paid" || payment.paid_amount > 0) && (
                                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleDownloadReceipt(payment.id)} disabled={loadingId === payment.id}>
                                  {loadingId === payment.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Receipt className="w-3 h-3 mr-1" />}
                                  Receipt
                                </Button>
                              )}
                              <UndoPaymentButton payment={payment} className="h-7" />
                              {payment.status !== "paid" && (
                                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setMarkPaidPayment(payment)}>
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  {payment.paid_amount > 0 ? "More" : "Receive"}
                                </Button>
                              )}
                            </div>
                          </div>
                          {payment.paid_date && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Paid on {format(new Date(payment.paid_date), "MMM d, yyyy")}
                              {payment.payment_method && ` via ${payment.payment_method}`}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </TabsContent>

              {/* Invoices Tab */}
              <TabsContent value="invoices" className="mt-4 space-y-3">
                {!invoices?.length ? (
                  <p className="text-center text-muted-foreground py-8">No invoices yet</p>
                ) : (
                  invoices.map((invoice) => (
                    <Card key={invoice.id}>
                      <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-mono text-sm font-medium">{invoice.invoice_number}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(invoice.due_date), "MMM d, yyyy")} • {formatINR(invoice.amount)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={invoiceStatusConfig[invoice.status]?.variant || "secondary"}>
                            {invoice.status}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setExpandedInvoiceId(expandedInvoiceId === invoice.id ? null : invoice.id)}
                          >
                            <History className="w-3 h-3 mr-1" />
                            History
                          </Button>
                        </div>
                      </div>
                      {expandedInvoiceId === invoice.id && (
                        <div className="mt-3 pt-3 border-t">
                          <ActivityLogList entityType="invoices" entityId={invoice.id} />
                        </div>
                      )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              {/* Ledger Tab */}
              <TabsContent value="ledger" className="mt-4">
                <div className="flex justify-end mb-3">
                  <Button variant="outline" size="sm" onClick={handleDownloadLedger} disabled={!ledgerEntries.length}>
                    <Download className="w-4 h-4 mr-1" />
                    Download CSV
                  </Button>
                </div>
                {!ledgerEntries.length ? (
                  <p className="text-center text-muted-foreground py-8">No records for ledger</p>
                ) : (
                  <div className="border rounded-lg overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Date</TableHead>
                          <TableHead className="text-xs">Particulars</TableHead>
                          <TableHead className="text-xs">Invoice #</TableHead>
                          <TableHead className="text-xs text-right">Debit</TableHead>
                          <TableHead className="text-xs text-right">Credit</TableHead>
                          <TableHead className="text-xs text-right">Balance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ledgerEntries.map((entry, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="text-xs whitespace-nowrap">
                              {format(new Date(entry.date), "dd MMM yy")}
                            </TableCell>
                            <TableCell className="text-xs">{entry.particulars}</TableCell>
                            <TableCell className="text-xs font-mono">{entry.invoiceNumber || "—"}</TableCell>
                            <TableCell className="text-xs text-right">
                              {entry.debit > 0 ? formatINR(entry.debit) : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-right text-success">
                              {entry.credit > 0 ? formatINR(entry.credit) : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-right font-medium">
                              {formatINR(entry.balance)}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="font-bold border-t-2">
                          <TableCell className="text-xs" colSpan={3}>
                            Total {totalPending > 0 ? "(Balance Due)" : totalPending < 0 ? "(Overpaid)" : ""}
                          </TableCell>
                          <TableCell className="text-xs text-right">{formatINR(totalDue)}</TableCell>
                          <TableCell className="text-xs text-right">{formatINR(totalPaid)}</TableCell>
                          <TableCell className="text-xs text-right">{formatINR(totalPending)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              {/* GST/TDS Tab */}
              <TabsContent value="gst-tds" className="mt-4">
                <GstTdsLedgerPanel scope={{ tenantId: tenant.id }} entityLabel={tenant.name} />
              </TabsContent>

              {/* Details/Config Tab */}
              <TabsContent value="config" className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="text-sm">{tenant.email || "-"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Phone</p>
                    <p className="text-sm">{tenant.phone || "-"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Lease Start</p>
                    <p className="text-sm">{format(new Date(tenant.lease_start_date), "MMM d, yyyy")}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Lease End</p>
                    <p className="text-sm">{format(new Date(tenant.lease_end_date), "MMM d, yyyy")}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Move-in Date</p>
                    <p className="text-sm">{format(new Date(tenant.move_in_date), "MMM d, yyyy")}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Security Deposit</p>
                    <p className="text-sm">{formatINR(tenant.security_deposit)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Rented Sqft</p>
                    <p className="text-sm">{tenant.rented_sqft || "-"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Invoice Date Day</p>
                    <p className="text-sm">{tenant.rent_due_day || 1}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Invoice Date Month</p>
                    <p className="text-sm">
                      {(() => {
                        const off = (tenant as any).rent_due_month_offset ?? 0;
                        if (off === -1) return "Previous month (advance)";
                        if (off === 1) return "Following month (arrears)";
                        return "Same month";
                      })()}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Payment Due</p>
                    <p className="text-sm">
                      {tenant.due_days_after_invoice
                        ? `${tenant.due_days_after_invoice} days after invoice date`
                        : "On invoice date"}
                    </p>
                  </div>
                </div>

                {/* Billing Details */}
                <div className="border-t pt-4 space-y-3">
                  <h4 className="text-sm font-semibold">Billing Details</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Bill From</p>
                      <p className="text-sm">{tenant.bill_from_name || "-"}</p>
                      {tenant.bill_from_gstin && <p className="text-xs text-muted-foreground">GSTIN: {tenant.bill_from_gstin}</p>}
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Bill To</p>
                      <p className="text-sm">{tenant.bill_to_name || "-"}</p>
                      {tenant.bill_to_gstin && <p className="text-xs text-muted-foreground">GSTIN: {tenant.bill_to_gstin}</p>}
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Activity Tab */}
              <TabsContent value="activity" className="mt-4">
                <ActivityLogList entityType="tenants" entityId={tenant.id} />
              </TabsContent>
            </Tabs>
          </div>
        </SheetContent>
      </Sheet>

      {editDialogOpen && (
        <AddTenantDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          editTenant={tenant}
        />
      )}

      {cloneDialogOpen && (
        <AddTenantDialog
          open={cloneDialogOpen}
          onOpenChange={setCloneDialogOpen}
          cloneFromTenant={tenant}
        />
      )}

      <MarkPaidDialog
        open={!!markPaidPayment}
        onOpenChange={(open) => !open && setMarkPaidPayment(null)}
        payment={markPaidPayment}
      />

      <ReceivePaymentDialog
        open={receivePaymentOpen}
        onOpenChange={setReceivePaymentOpen}
        tenantId={tenant.id}
      />

      <PdfPreviewDialog preview={preview} onClose={closePreview} onRefresh={refreshPreview} />

      <VacateTenantDialog
        tenant={tenant}
        open={vacateDialogOpen}
        onOpenChange={setVacateDialogOpen}
        onVacated={() => onOpenChange(false)}
      />

      <GenerateRentAgreementDialog
        tenant={tenant}
        open={agreementDialogOpen}
        onOpenChange={setAgreementDialogOpen}
      />
    </>
  );
};

export default TenantDetailSheet;

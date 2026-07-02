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
} from "lucide-react";
import { Tenant } from "@/hooks/useTenants";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatINR } from "@/lib/currency";
import { toast } from "sonner";
import AddTenantDialog from "./AddTenantDialog";
import VacateTenantDialog from "./VacateTenantDialog";
import { MarkPaidDialog } from "@/components/payments/MarkPaidDialog";
import { RentPayment } from "@/hooks/usePayments";
import { paymentStatusConfig } from "@/lib/statusConfig";
import { generateAndOpenInvoicePdf, generateAndOpenReceiptPdf } from "@/lib/pdfUtils";

interface TenantDetailSheetProps {
  tenant: Tenant | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TenantDetailSheet = ({ tenant, open, onOpenChange }: TenantDetailSheetProps) => {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [vacateDialogOpen, setVacateDialogOpen] = useState(false);
  const [generatingInvoice, setGeneratingInvoice] = useState<string | null>(null);
  const [generatingReceipt, setGeneratingReceipt] = useState<string | null>(null);
  const [markPaidPayment, setMarkPaidPayment] = useState<RentPayment | null>(null);
  const [activeTab, setActiveTab] = useState("payments");

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

  const handleGenerateInvoice = async (paymentId: string) => {
    setGeneratingInvoice(paymentId);
    try {
      await generateAndOpenInvoicePdf(paymentId);
    } catch (error: any) {
      toast.error("Failed to generate invoice: " + error.message);
    } finally {
      setGeneratingInvoice(null);
    }
  };

  const handleDownloadReceipt = async (paymentId: string) => {
    setGeneratingReceipt(paymentId);
    try {
      await generateAndOpenReceiptPdf(paymentId);
    } catch (error: any) {
      toast.error("Failed to generate receipt: " + error.message);
    } finally {
      setGeneratingReceipt(null);
    }
  };

  const handleDownloadLedger = () => {
    if (!payments || !tenant) return;

    const headers = ["Billing Month", "Due Date", "Amount", "Paid Amount", "Status", "Paid Date", "Payment Method", "Notes"];
    const rows = payments.map((p) => [
      p.billing_month || "",
      p.due_date,
      p.amount,
      (p as any).paid_amount || 0,
      p.status,
      p.paid_date || "",
      p.payment_method || "",
      p.notes || "",
    ]);

    const totalDue = payments.reduce((s, p) => s + p.amount, 0);
    const totalPaid = payments.reduce((s, p) => s + ((p as any).paid_amount || 0), 0);
    rows.push(["", "", "", "", "", "", "", ""]);
    rows.push(["TOTAL", "", totalDue, totalPaid, "", "", "", ""]);

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
  const totalPaid = payments?.reduce((s, p) => s + ((p as any).paid_amount || 0), 0) || 0;
  const totalPending = totalDue - totalPaid;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-[700px] w-full overflow-y-auto p-0">
          <SheetHeader className="p-6 pb-4 border-b border-border">
            <div className="flex items-start justify-between">
              <div>
                <SheetTitle className="text-xl">{tenant.name}</SheetTitle>
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
              <Button variant="outline" size="sm" onClick={() => setEditDialogOpen(true)}>
                <Settings className="w-4 h-4 mr-1" />
                Edit
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
              <Card className="bg-green-500/5 border-green-500/20">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Total Collected</p>
                  <p className="text-lg font-bold text-green-600">{formatINR(totalPaid)}</p>
                </CardContent>
              </Card>
              <Card className="bg-orange-500/5 border-orange-500/20">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Outstanding</p>
                  <p className="text-lg font-bold text-orange-600">{formatINR(totalPending)}</p>
                </CardContent>
              </Card>
            </div>
          </SheetHeader>

          <div className="p-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-4">
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
                <TabsTrigger value="config" className="text-xs sm:text-sm">
                  <Settings className="w-3 h-3 mr-1 hidden sm:inline" />
                  Details
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
                              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleGenerateInvoice(payment.id)} disabled={generatingInvoice === payment.id}>
                                {generatingInvoice === payment.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3 mr-1" />}
                                Invoice
                              </Button>
                              {(payment.status === "paid" || payment.status === "partial") && (
                                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleDownloadReceipt(payment.id)} disabled={generatingReceipt === payment.id}>
                                  {generatingReceipt === payment.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Receipt className="w-3 h-3 mr-1" />}
                                  Receipt
                                </Button>
                              )}
                              {payment.status !== "paid" && (
                                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setMarkPaidPayment(payment)}>
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  {payment.status === "partial" ? "More" : "Receive"}
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
                      <CardContent className="p-3 flex items-center justify-between">
                        <div>
                          <p className="font-mono text-sm font-medium">{invoice.invoice_number}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(invoice.due_date), "MMM d, yyyy")} • {formatINR(invoice.amount)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={invoice.status === "paid" ? "glow" : invoice.status === "overdue" ? "destructive" : "secondary"}>
                            {invoice.status}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              {/* Ledger Tab */}
              <TabsContent value="ledger" className="mt-4">
                <div className="flex justify-end mb-3">
                  <Button variant="outline" size="sm" onClick={handleDownloadLedger} disabled={!payments?.length}>
                    <Download className="w-4 h-4 mr-1" />
                    Download CSV
                  </Button>
                </div>
                {!payments?.length ? (
                  <p className="text-center text-muted-foreground py-8">No records for ledger</p>
                ) : (
                  <div className="border rounded-lg overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Month</TableHead>
                          <TableHead className="text-xs">Due</TableHead>
                          <TableHead className="text-xs">Paid</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payments.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="text-xs">
                              {p.billing_month
                                ? new Date(parseInt(p.billing_month.split("-")[0]), parseInt(p.billing_month.split("-")[1]) - 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" })
                                : format(new Date(p.due_date), "MMM yy")}
                            </TableCell>
                            <TableCell className="text-xs font-medium">{formatINR(p.amount)}</TableCell>
                            <TableCell className="text-xs">{formatINR((p as any).paid_amount || 0)}</TableCell>
                            <TableCell>
                              <Badge variant={paymentStatusConfig[p.status]?.variant || "secondary"} className="text-xs">
                                {p.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="font-bold border-t-2">
                          <TableCell className="text-xs">Total</TableCell>
                          <TableCell className="text-xs">{formatINR(totalDue)}</TableCell>
                          <TableCell className="text-xs">{formatINR(totalPaid)}</TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                )}
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
                    <p className="text-xs text-muted-foreground">Rent Due Day</p>
                    <p className="text-sm">{tenant.rent_due_day || 1}</p>
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

      <MarkPaidDialog
        open={!!markPaidPayment}
        onOpenChange={(open) => !open && setMarkPaidPayment(null)}
        payment={markPaidPayment}
      />
    </>
  );
};

export default TenantDetailSheet;

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
  AlertCircle,
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
import { MarkPaidDialog } from "@/components/payments/MarkPaidDialog";
import { RentPayment } from "@/hooks/usePayments";

interface TenantDetailSheetProps {
  tenant: Tenant | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusConfig: Record<string, { variant: "glow" | "secondary" | "destructive"; icon: React.ElementType }> = {
  paid: { variant: "glow", icon: CheckCircle },
  pending: { variant: "secondary", icon: Clock },
  overdue: { variant: "destructive", icon: AlertCircle },
  partial: { variant: "secondary", icon: Clock },
};

const TenantDetailSheet = ({ tenant, open, onOpenChange }: TenantDetailSheetProps) => {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
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
      const { data, error } = await supabase.functions.invoke("generate-invoice-pdf", {
        body: { paymentId },
      });
      if (error) throw error;
      const byteCharacters = atob(data.pdf);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const blob = new Blob([new Uint8Array(byteNumbers)], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast.success("Invoice opened!");
    } catch (error: any) {
      toast.error("Failed to generate invoice: " + error.message);
    } finally {
      setGeneratingInvoice(null);
    }
  };

  const handleDownloadReceipt = async (paymentId: string) => {
    setGeneratingReceipt(paymentId);
    try {
      const { data, error } = await supabase.functions.invoke("generate-receipt-pdf", {
        body: { paymentId },
      });
      if (error) throw error;
      const byteCharacters = atob(data.pdf);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const blob = new Blob([new Uint8Array(byteNumbers)], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast.success("Receipt opened!");
    } catch (error: any) {
      toast.error("Failed to generate receipt: " + error.message);
    } finally {
      setGeneratingReceipt(null);
    }
  };

  const handleDownloadLedger = () => {
    if (!payments || !tenant) return;

    // Build CSV ledger
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
                    const StatusIcon = statusConfig[payment.status]?.icon || Clock;
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
                            <Badge variant={statusConfig[payment.status]?.variant || "secondary"}>
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
                              <Badge variant={statusConfig[p.status]?.variant || "secondary"} className="text-xs">
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
                  <InfoRow label="Email" value={tenant.email} />
                  <InfoRow label="Phone" value={tenant.phone} />
                  <InfoRow label="Monthly Rent" value={formatINR(tenant.monthly_rent || 0)} />
                  <InfoRow label="Rent Due Day" value={`${tenant.rent_due_day || 1}${getSuffix(tenant.rent_due_day || 1)} of month`} />
                  <InfoRow label="Security Deposit" value={formatINR(tenant.security_deposit || 0)} />
                  <InfoRow label="Rented Sqft" value={tenant.rented_sqft ? `${tenant.rented_sqft} sqft` : "-"} />
                  <InfoRow label="Move-in Date" value={format(new Date(tenant.move_in_date), "MMM d, yyyy")} />
                  <InfoRow label="Lease Start" value={format(new Date(tenant.lease_start_date), "MMM d, yyyy")} />
                  <InfoRow label="Lease End" value={format(new Date(tenant.lease_end_date), "MMM d, yyyy")} />
                  <InfoRow label="GST Required" value={tenant.requires_gst ? "Yes" : "No"} />
                </div>

                {(tenant.bill_from_name || tenant.bill_to_name) && (
                  <div className="space-y-3 pt-3 border-t border-border">
                    <h4 className="text-sm font-semibold">Billing Details</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {tenant.bill_from_name && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Bill From</p>
                          <p className="text-sm font-medium">{tenant.bill_from_name}</p>
                          {tenant.bill_from_address && <p className="text-xs text-muted-foreground">{tenant.bill_from_address}</p>}
                          {tenant.bill_from_gstin && <p className="text-xs text-muted-foreground">GSTIN: {tenant.bill_from_gstin}</p>}
                        </div>
                      )}
                      {tenant.bill_to_name && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Bill To</p>
                          <p className="text-sm font-medium">{tenant.bill_to_name}</p>
                          {tenant.bill_to_address && <p className="text-xs text-muted-foreground">{tenant.bill_to_address}</p>}
                          {tenant.bill_to_gstin && <p className="text-xs text-muted-foreground">GSTIN: {tenant.bill_to_gstin}</p>}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="pt-3">
                  <Button variant="outline" className="w-full" onClick={() => setEditDialogOpen(true)}>
                    <Settings className="w-4 h-4 mr-2" />
                    Edit Tenant Configuration
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </SheetContent>
      </Sheet>

      <AddTenantDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        editTenant={tenant}
      />

      {markPaidPayment && (
        <MarkPaidDialog
          open={!!markPaidPayment}
          onOpenChange={(open) => !open && setMarkPaidPayment(null)}
          payment={markPaidPayment}
        />
      )}
    </>
  );
};

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value || "-"}</p>
    </div>
  );
}

function getSuffix(n: number) {
  if (n >= 11 && n <= 13) return "th";
  switch (n % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

export default TenantDetailSheet;

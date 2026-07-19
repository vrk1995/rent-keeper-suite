import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { CreditCard, CheckCircle, Clock, AlertCircle, Building2, RefreshCw, FileText, Loader2, Calendar, Receipt, Users, Search, Pencil, IndianRupee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useFilterOptions } from "@/hooks/useFilterOptions";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { SortMenuButton } from "@/components/ui/sort-menu-button";
import { useSortState } from "@/hooks/useSortState";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { usePayments, useGenerateMonthlyPayments, RentPayment } from "@/hooks/usePayments";
import { useInvoices } from "@/hooks/useInvoices";
import { formatINR } from "@/lib/currency";
import { MarkPaidDialog } from "@/components/payments/MarkPaidDialog";
import { PdfPreviewDialog } from "@/components/payments/PdfPreviewDialog";
import { UndoPaymentButton } from "@/components/payments/UndoPaymentButton";
import { EditPaymentDialog } from "@/components/payments/EditPaymentDialog";
import { PaymentHistoryDialog } from "@/components/payments/PaymentHistoryDialog";
import { ReceivePaymentDialog } from "@/components/payments/ReceivePaymentDialog";
import { paymentStatusConfig } from "@/lib/statusConfig";
import { usePdfPreview } from "@/hooks/usePdfPreview";
import { useIsAdmin } from "@/hooks/useTeam";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ErrorState } from "@/components/ui/error-state";

const getMonthOptions = () => {
  const now = new Date();
  const options: { label: string; year: number; month: number }[] = [];
  for (let offset = 1; offset >= -12; offset--) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    options.push({
      label: d.toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
      year: d.getFullYear(),
      month: d.getMonth() + 1,
    });
  }
  return options;
};

const formatBillingMonth = (billingMonth: string | null, dueDate: string) => {
  if (billingMonth) {
    const [y, m] = billingMonth.split("-");
    const d = new Date(parseInt(y), parseInt(m) - 1, 1);
    return d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
  }
  const d = new Date(dueDate);
  return d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
};

const Payments = () => {
  const { data: payments, isLoading, isError, refetch } = usePayments();
  const { data: invoices } = useInvoices();
  const { propertyOptions, tenantOptions } = useFilterOptions();
  const generatePayments = useGenerateMonthlyPayments();
  const [searchQuery, setSearchQuery] = useState("");
  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [tenantFilter, setTenantFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const sort = useSortState<"property" | "tenant" | "invoice" | "amount" | "invoice_date" | "due_date" | "paid_date">("due_date", "desc");
  const [selectedPayment, setSelectedPayment] = useState<RentPayment | null>(null);
  const [markPaidDialogOpen, setMarkPaidDialogOpen] = useState(false);
  const { preview, loadingId, openInvoice, refreshPreview, closePreview } = usePdfPreview();
  const { isAdmin } = useIsAdmin();
  const [editPayment, setEditPayment] = useState<{ paymentId: string; invoiceId: string | null } | null>(null);
  const [resolvingEditId, setResolvingEditId] = useState<string | null>(null);
  const [historyPayment, setHistoryPayment] = useState<RentPayment | null>(null);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [receivePaymentOpen, setReceivePaymentOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth() + 1}`;
  });

  const monthOptions = getMonthOptions();

  // Invoices aren't linked to payments by FK, so match on the same natural key used
  // elsewhere: property + tenant + due date + amount.
  const invoiceNumberByPayment = new Map<string, string>();
  invoices?.forEach((inv) => {
    invoiceNumberByPayment.set(
      `${inv.property_id}|${inv.tenant_id}|${inv.due_date}|${Number(inv.amount).toFixed(2)}`,
      inv.invoice_number
    );
  });
  const getInvoiceNumber = (p: RentPayment) =>
    invoiceNumberByPayment.get(`${p.property_id}|${p.tenant_id}|${p.due_date}|${Number(p.amount).toFixed(2)}`) || "";

  const filteredPayments = payments
    ?.filter((p) => {
      const matchesProperty = propertyFilter === "all" || p.property_id === propertyFilter;
      const matchesTenant = tenantFilter === "all" || p.tenant_id === tenantFilter;
      const matchesStatus = statusFilter === "all" || p.status === statusFilter;
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !query ||
        p.tenant?.name?.toLowerCase().includes(query) ||
        p.property?.name?.toLowerCase().includes(query) ||
        String(p.amount).includes(query);
      return matchesProperty && matchesTenant && matchesStatus && matchesSearch;
    })
    ?.slice()
    ?.sort((a, b) => {
      const dateVal = (d?: string | null) => (d ? new Date(d).getTime() : 0);
      switch (sort.field) {
        case "property":
          return sort.dir * (a.property?.name || "").localeCompare(b.property?.name || "");
        case "tenant":
          return sort.dir * (a.tenant?.name || "").localeCompare(b.tenant?.name || "");
        case "invoice":
          return sort.dir * (getInvoiceNumber(a) || "").localeCompare(getInvoiceNumber(b) || "");
        case "amount":
          return sort.dir * (a.amount - b.amount);
        case "invoice_date":
          return sort.dir * (dateVal(a.invoice_date) - dateVal(b.invoice_date));
        case "due_date":
          return sort.dir * (dateVal(a.due_date) - dateVal(b.due_date));
        case "paid_date":
          return sort.dir * (dateVal(a.paid_date) - dateVal(b.paid_date));
        default:
          return 0;
      }
    });

  const stats = {
    total: payments?.length || 0,
    paid: payments?.filter((p) => p.status === "paid").length || 0,
    pending: payments?.filter((p) => p.status === "pending").length || 0,
    overdue: payments?.filter((p) => p.status === "overdue").length || 0,
    totalAmount: payments?.reduce((sum, p) => sum + p.amount, 0) || 0,
    paidAmount: payments?.filter((p) => p.status === "paid").reduce((sum, p) => sum + p.amount, 0) || 0,
  };

  const handleMarkPaid = (payment: RentPayment) => {
    setSelectedPayment(payment);
    setMarkPaidDialogOpen(true);
  };

  const handleGenerateInvoice = (paymentId: string) => {
    openInvoice(paymentId).catch((error: any) => {
      console.error("Error generating invoice:", error);
      toast.error("Failed to generate invoice: " + error.message);
    });
  };

  // Resolve the invoice (if any) currently matching this payment's due_date/amount so the
  // two stay in sync — invoices are matched to payments by these fields, not a foreign key.
  const handleEditPayment = async (payment: RentPayment) => {
    setResolvingEditId(payment.id);
    try {
      const { data: invoice, error } = await supabase
        .from("invoices")
        .select("id")
        .eq("property_id", payment.property_id)
        .eq("tenant_id", payment.tenant_id)
        .eq("due_date", payment.due_date)
        .eq("amount", payment.amount)
        .maybeSingle();

      if (error) throw error;

      setEditPayment({ paymentId: payment.id, invoiceId: invoice?.id ?? null });
    } catch (error: any) {
      toast.error("Failed to open editor: " + error.message);
    } finally {
      setResolvingEditId(null);
    }
  };

  const handleOpenHistory = (payment: RentPayment) => {
    setHistoryPayment(payment);
  };

  const handleGeneratePayments = () => {
    const [year, month] = selectedMonth.split("-").map(Number);
    generatePayments.mutate({ year, month });
    setGenerateDialogOpen(false);
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold">Payments</h1>
          <p className="text-sm md:text-base text-muted-foreground">Track and manage rent payments</p>
        </div>
        <div className="flex gap-2 w-fit">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setReceivePaymentOpen(true)}
          >
            <IndianRupee className="w-4 h-4 mr-2" />
            Receive Payment
          </Button>
          <Button
            variant="hero"
            size="sm"
            onClick={() => setGenerateDialogOpen(true)}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Generate Payments
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Collected</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-display font-bold text-primary">{formatINR(stats.paidAmount)}</p>
            <p className="text-xs text-muted-foreground">{stats.paid} payments</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-display font-bold">{stats.pending}</p>
            <p className="text-xs text-muted-foreground">payments</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Overdue</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-display font-bold text-destructive">{stats.overdue}</p>
            <p className="text-xs text-muted-foreground">payments</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Expected Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-display font-bold">{formatINR(stats.totalAmount)}</p>
            <p className="text-xs text-muted-foreground">{stats.total} payments</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by tenant, property, amount..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <SearchableSelect
          options={propertyOptions}
          value={propertyFilter}
          onValueChange={setPropertyFilter}
          placeholder="Select Property"
          searchPlaceholder="Search properties..."
          emptyMessage="No properties found."
          allOption
          allLabel="All Properties"
          icon={<Building2 className="w-4 h-4" />}
          triggerClassName="w-full sm:w-[200px]"
        />
        <SearchableSelect
          options={tenantOptions}
          value={tenantFilter}
          onValueChange={setTenantFilter}
          placeholder="Select Tenant"
          searchPlaceholder="Search tenants..."
          emptyMessage="No tenants found."
          allOption
          allLabel="All Tenants"
          icon={<Users className="w-4 h-4" />}
          triggerClassName="w-full sm:w-[200px]"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>
        {/* Desktop sorts via clickable column headers; mobile (no table) gets this menu. */}
        <SortMenuButton
          className="w-full sm:hidden"
          options={[
            { value: "property", label: "Property" },
            { value: "tenant", label: "Tenant" },
            { value: "invoice", label: "Invoice #" },
            { value: "amount", label: "Amount" },
            { value: "invoice_date", label: "Invoice Date" },
            { value: "due_date", label: "Due Date" },
            { value: "paid_date", label: "Paid Date" },
          ]}
          currentField={sort.field}
          currentDirection={sort.direction}
          onSort={sort.toggleSort}
        />
      </div>

      {/* Payments Table */}
      {isLoading ? (
        <div className="h-64 bg-secondary/30 rounded-xl animate-pulse" />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : filteredPayments?.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-16 text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <CreditCard className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-xl font-semibold mb-2">No payments found</h3>
          <p className="text-muted-foreground mb-4">
            Click "Generate Monthly Payments" to create payment records for active tenants
          </p>
          <Button variant="hero" onClick={() => setGenerateDialogOpen(true)}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Generate Payments
          </Button>
        </motion.div>
      ) : (
        <div>
          {/* Desktop table */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead label="Property" sortKey="property" currentField={sort.field} currentDirection={sort.direction} onSort={sort.toggleSort} />
                    <SortableTableHead label="Tenant" sortKey="tenant" currentField={sort.field} currentDirection={sort.direction} onSort={sort.toggleSort} />
                    <SortableTableHead label="Invoice #" sortKey="invoice" currentField={sort.field} currentDirection={sort.direction} onSort={sort.toggleSort} />
                    <TableHead>Billing Month</TableHead>
                    <SortableTableHead label="Amount" sortKey="amount" currentField={sort.field} currentDirection={sort.direction} onSort={sort.toggleSort} />
                    <SortableTableHead label="Invoice Date" sortKey="invoice_date" currentField={sort.field} currentDirection={sort.direction} onSort={sort.toggleSort} />
                    <SortableTableHead label="Due Date" sortKey="due_date" currentField={sort.field} currentDirection={sort.direction} onSort={sort.toggleSort} />
                    <TableHead>Status</TableHead>
                    <SortableTableHead label="Paid Date" sortKey="paid_date" currentField={sort.field} currentDirection={sort.direction} onSort={sort.toggleSort} />
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayments?.map((payment) => {
                    const StatusIcon = paymentStatusConfig[payment.status]?.icon || Clock;
                    const locationDisplay = payment.unit 
                      ? `${payment.unit.building?.name} - ${payment.unit.name}`
                      : payment.property?.name;
                    return (
                      <TableRow key={payment.id}>
                        <TableCell className="font-medium">
                          {payment.unit && <Building2 className="w-3 h-3 inline mr-1 text-muted-foreground" />}
                          {locationDisplay}
                        </TableCell>
                        <TableCell>{payment.tenant?.name}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {getInvoiceNumber(payment) || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-normal">
                            <Calendar className="w-3 h-3 mr-1" />
                            {formatBillingMonth(payment.billing_month, payment.due_date)}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-semibold">{formatINR(payment.amount)}</TableCell>
                        <TableCell>
                          {payment.invoice_date ? format(new Date(payment.invoice_date), "MMM d, yyyy") : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {format(new Date(payment.due_date), "MMM d, yyyy")}
                            {isAdmin && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                aria-label="Edit due date"
                                onClick={() => handleEditPayment(payment)}
                                disabled={resolvingEditId === payment.id}
                              >
                                {resolvingEditId === payment.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Pencil className="h-3 w-3" />
                                )}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={paymentStatusConfig[payment.status]?.variant || "secondary"}>
                            <StatusIcon className="w-3 h-3 mr-1" />
                            {payment.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {payment.paid_date ? format(new Date(payment.paid_date), "MMM d, yyyy") : "-"}
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleGenerateInvoice(payment.id)}
                            disabled={loadingId === payment.id}
                          >
                            {loadingId === payment.id ? (
                              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                            ) : (
                              <FileText className="w-4 h-4 mr-1" />
                            )}
                            Invoice
                          </Button>
                          {(payment.status === "paid" || payment.status === "partial") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenHistory(payment)}
                            >
                              <Receipt className="w-4 h-4 mr-1" />
                              Receipts
                            </Button>
                          )}
                          <UndoPaymentButton payment={payment} />
                          {payment.status !== "paid" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleMarkPaid(payment)}
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              {payment.status === "partial" ? "Record Another Payment" : "Record Payment"}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Mobile card list */}
          <div className="md:hidden space-y-3">
            {filteredPayments?.map((payment) => {
              const StatusIcon = paymentStatusConfig[payment.status]?.icon || Clock;
              const locationDisplay = payment.unit 
                ? `${payment.unit.building?.name} - ${payment.unit.name}`
                : payment.property?.name;
              return (
                <Card key={payment.id} className="overflow-hidden">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between mb-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{payment.tenant?.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{locationDisplay}</p>
                        {getInvoiceNumber(payment) && (
                          <p className="text-xs font-mono text-muted-foreground truncate">{getInvoiceNumber(payment)}</p>
                        )}
                      </div>
                      <Badge variant={paymentStatusConfig[payment.status]?.variant || "secondary"} className="text-xs ml-2 shrink-0">
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {payment.status}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-lg font-bold">{formatINR(payment.amount)}</span>
                      <Badge variant="outline" className="text-xs font-normal">
                        <Calendar className="w-3 h-3 mr-1" />
                        {formatBillingMonth(payment.billing_month, payment.due_date)}
                      </Badge>
                    </div>
                    {payment.invoice_date && (
                      <div className="text-xs text-muted-foreground mb-1">
                        Invoice: {format(new Date(payment.invoice_date), "MMM d, yyyy")}
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                      <span className="flex items-center gap-1">
                        Due: {format(new Date(payment.due_date), "MMM d, yyyy")}
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            aria-label="Edit due date"
                            onClick={() => handleEditPayment(payment)}
                            disabled={resolvingEditId === payment.id}
                          >
                            {resolvingEditId === payment.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Pencil className="h-3 w-3" />
                            )}
                          </Button>
                        )}
                      </span>
                      {payment.paid_date && <span>Paid: {format(new Date(payment.paid_date), "MMM d")}</span>}
                    </div>
                    <div className="flex gap-2 border-t border-white/5 pt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="flex-1 h-8 text-xs"
                        onClick={() => handleGenerateInvoice(payment.id)}
                        disabled={loadingId === payment.id}
                      >
                        {loadingId === payment.id ? (
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        ) : (
                          <FileText className="w-3 h-3 mr-1" />
                        )}
                        Invoice
                      </Button>
                      {(payment.status === "paid" || payment.status === "partial") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex-1 h-8 text-xs"
                          onClick={() => handleOpenHistory(payment)}
                        >
                          <Receipt className="w-3 h-3 mr-1" />
                          Receipts
                        </Button>
                      )}
                      <UndoPaymentButton payment={payment} className="h-8" />
                      {payment.status !== "paid" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex-1 h-8 text-xs"
                          onClick={() => handleMarkPaid(payment)}
                        >
                          <CheckCircle className="w-3 h-3 mr-1" />
                          {payment.status === "partial" ? "Record Another Payment" : "Record Payment"}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Generate Payments Dialog */}
      <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Generate Monthly Payments</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Select the billing month to generate rent payment records for all active tenants.
            </p>
            <div className="space-y-2">
              <label className="text-sm font-medium">Billing Month</label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((opt) => (
                    <SelectItem key={`${opt.year}-${opt.month}`} value={`${opt.year}-${opt.month}`}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                e.g. If generating in July for June rent, select "June"
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateDialogOpen(false)}>Cancel</Button>
            <Button variant="hero" onClick={handleGeneratePayments} disabled={generatePayments.isPending}>
              {generatePayments.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MarkPaidDialog
        open={markPaidDialogOpen}
        onOpenChange={setMarkPaidDialogOpen}
        payment={selectedPayment}
      />

      <PdfPreviewDialog preview={preview} onClose={closePreview} onRefresh={refreshPreview} />

      <EditPaymentDialog
        paymentId={editPayment?.paymentId ?? null}
        invoiceId={editPayment?.invoiceId ?? undefined}
        open={!!editPayment}
        onOpenChange={(open) => !open && setEditPayment(null)}
      />

      <PaymentHistoryDialog
        payment={historyPayment}
        open={!!historyPayment}
        onOpenChange={(open) => !open && setHistoryPayment(null)}
      />

      <ReceivePaymentDialog
        open={receivePaymentOpen}
        onOpenChange={setReceivePaymentOpen}
      />
    </div>
  );
};

export default Payments;

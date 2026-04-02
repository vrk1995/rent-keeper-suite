import { useState } from "react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { Search, CreditCard, CheckCircle, Clock, AlertCircle, Building2, RefreshCw, FileText, Loader2, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { usePayments, useGenerateMonthlyPayments, RentPayment } from "@/hooks/usePayments";
import { formatINR } from "@/lib/currency";
import { MarkPaidDialog } from "@/components/payments/MarkPaidDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const statusConfig: Record<string, { icon: React.ElementType; variant: "glow" | "secondary" | "destructive" }> = {
  paid: { icon: CheckCircle, variant: "glow" },
  pending: { icon: Clock, variant: "secondary" },
  overdue: { icon: AlertCircle, variant: "destructive" },
  partial: { icon: Clock, variant: "secondary" },
};

const getMonthOptions = () => {
  const now = new Date();
  const options: { label: string; year: number; month: number }[] = [];
  // Previous month, current month, next month
  for (let offset = -1; offset <= 1; offset++) {
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
  const { data: payments, isLoading } = usePayments();
  const generatePayments = useGenerateMonthlyPayments();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedPayment, setSelectedPayment] = useState<RentPayment | null>(null);
  const [markPaidDialogOpen, setMarkPaidDialogOpen] = useState(false);
  const [generatingInvoice, setGeneratingInvoice] = useState<string | null>(null);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth() + 1}`;
  });

  const monthOptions = getMonthOptions();

  const filteredPayments = payments?.filter((p) => {
    const propertyName = p.property?.name?.toLowerCase() || "";
    const unitName = p.unit?.name?.toLowerCase() || "";
    const buildingName = p.unit?.building?.name?.toLowerCase() || "";
    const tenantName = p.tenant?.name?.toLowerCase() || "";
    const searchLower = searchQuery.toLowerCase();
    
    const matchesSearch =
      propertyName.includes(searchLower) ||
      unitName.includes(searchLower) ||
      buildingName.includes(searchLower) ||
      tenantName.includes(searchLower);
    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
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

  const handleGeneratePayments = () => {
    const [year, month] = selectedMonth.split("-").map(Number);
    generatePayments.mutate({ year, month });
    setGenerateDialogOpen(false);
  };

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
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "application/pdf" });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = data.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Invoice downloaded successfully!");
    } catch (error: any) {
      console.error("Error generating invoice:", error);
      toast.error("Failed to generate invoice: " + error.message);
    } finally {
      setGeneratingInvoice(null);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold">Payments</h1>
          <p className="text-sm md:text-base text-muted-foreground">Track and manage rent payments</p>
        </div>
        <Button 
          variant="hero"
          size="sm"
          className="w-fit"
          onClick={() => setGenerateDialogOpen(true)}
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Generate Payments
        </Button>
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
      <div className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by property or tenant..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Payments Table */}
      {isLoading ? (
        <div className="h-64 bg-secondary/30 rounded-xl animate-pulse" />
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
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Property</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Billing Month</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Paid Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPayments?.map((payment) => {
                  const StatusIcon = statusConfig[payment.status]?.icon || Clock;
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
                      <TableCell>
                        <Badge variant="outline" className="font-normal">
                          <Calendar className="w-3 h-3 mr-1" />
                          {formatBillingMonth(payment.billing_month, payment.due_date)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-semibold">{formatINR(payment.amount)}</TableCell>
                      <TableCell>{format(new Date(payment.due_date), "MMM d, yyyy")}</TableCell>
                      <TableCell>
                        <Badge variant={statusConfig[payment.status]?.variant || "secondary"}>
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
                          disabled={generatingInvoice === payment.id}
                        >
                          {generatingInvoice === payment.id ? (
                            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                          ) : (
                            <FileText className="w-4 h-4 mr-1" />
                          )}
                          Invoice
                        </Button>
                        {payment.status !== "paid" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleMarkPaid(payment)}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Mark Received
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
    </div>
  );
};

export default Payments;

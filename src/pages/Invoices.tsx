import { useState } from "react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { Plus, FileText, Send, Download, Loader2, CheckCircle, Clock, AlertCircle, Building2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useInvoices, useCreateInvoice, useUpdateInvoiceStatus } from "@/hooks/useInvoices";
import { useFilterOptions } from "@/hooks/useFilterOptions";
import { formatINR } from "@/lib/currency";
import { Label } from "@/components/ui/label";
import { CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { invoiceStatusConfig } from "@/lib/statusConfig";
import { openPdfFromBase64 } from "@/lib/pdfUtils";
import { ErrorState } from "@/components/ui/error-state";

const Invoices = () => {
  const { data: invoices, isLoading, isError, refetch } = useInvoices();
  const { propertyOptions, tenantOptions, properties, tenants } = useFilterOptions();
  const createInvoice = useCreateInvoice();
  const updateStatus = useUpdateInvoiceStatus();
  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [tenantFilter, setTenantFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState("");
  const [selectedTenant, setSelectedTenant] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState<Date>();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const filteredInvoices = invoices?.filter((inv) => {
    const matchesProperty = propertyFilter === "all" || inv.property_id === propertyFilter;
    const matchesTenant = tenantFilter === "all" || inv.tenant_id === tenantFilter;
    const matchesStatus = statusFilter === "all" || inv.status === statusFilter;
    return matchesProperty && matchesTenant && matchesStatus;
  });

  const stats = {
    total: invoices?.length || 0,
    paid: invoices?.filter((i) => i.status === "paid").length || 0,
    sent: invoices?.filter((i) => i.status === "sent").length || 0,
    draft: invoices?.filter((i) => i.status === "draft").length || 0,
    totalAmount: invoices?.reduce((sum, i) => sum + i.amount, 0) || 0,
    paidAmount: invoices?.filter((i) => i.status === "paid").reduce((sum, i) => sum + i.amount, 0) || 0,
  };

  const propertyTenants = tenants?.filter((t) => t.property_id === selectedProperty);

  const handleCreateInvoice = async () => {
    if (!selectedProperty || !selectedTenant || !amount || !dueDate) return;

    // Auto-fill amount from tenant if available
    await createInvoice.mutateAsync({
      property_id: selectedProperty,
      tenant_id: selectedTenant,
      amount: parseFloat(amount),
      due_date: format(dueDate, "yyyy-MM-dd"),
    });

    setDialogOpen(false);
    setSelectedProperty("");
    setSelectedTenant("");
    setAmount("");
    setDueDate(undefined);
  };

  // Auto-fill amount when tenant is selected
  const handleTenantSelect = (tenantId: string) => {
    setSelectedTenant(tenantId);
    const tenant = tenants?.find(t => t.id === tenantId);
    if (tenant?.monthly_rent && !amount) {
      setAmount(String(tenant.monthly_rent));
    }
  };

  const handleSendInvoice = async (id: string) => {
    await updateStatus.mutateAsync({ id, status: "sent" });
  };

  const handleDownloadInvoice = async (invoice: typeof invoices extends (infer T)[] | undefined ? T : never) => {
    setDownloadingId(invoice.id);
    try {
      const { data: payment, error: paymentError } = await supabase
        .from("rent_payments")
        .select("id")
        .eq("property_id", invoice.property_id)
        .eq("tenant_id", invoice.tenant_id)
        .eq("due_date", invoice.due_date)
        .maybeSingle();

      if (paymentError) throw paymentError;

      if (!payment) {
        toast.info("Invoice PDF not available - no linked payment record found");
        return;
      }

      const { data, error } = await supabase.functions.invoke("generate-invoice-pdf", {
        body: { paymentId: payment.id },
      });

      if (error) throw error;
      openPdfFromBase64(data.pdf);
      toast.success("Invoice opened!");
    } catch (error: any) {
      console.error("Error downloading invoice:", error);
      toast.error("Failed to download invoice: " + error.message);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold">Invoices</h1>
          <p className="text-sm md:text-base text-muted-foreground">Create and manage rent invoices</p>
        </div>
        <Button variant="hero" size="sm" className="w-fit" onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Ad-hoc Invoice
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Invoiced</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-display font-bold text-primary">{formatINR(stats.totalAmount)}</p>
            <p className="text-xs text-muted-foreground">{stats.total} invoices</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Paid</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-display font-bold text-primary">{formatINR(stats.paidAmount)}</p>
            <p className="text-xs text-muted-foreground">{stats.paid} invoices</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Sent</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-display font-bold">{stats.sent}</p>
            <p className="text-xs text-muted-foreground">invoices</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Draft</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-display font-bold">{stats.draft}</p>
            <p className="text-xs text-muted-foreground">invoices</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
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
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="h-64 bg-secondary/30 rounded-xl animate-pulse" />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : filteredInvoices?.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-16 text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <FileText className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-xl font-semibold mb-2">No invoices yet</h3>
          <p className="text-muted-foreground mb-4">
            Invoices are automatically created with rent payments. Use "Create Ad-hoc Invoice" for non-rent charges.
          </p>
        </motion.div>
      ) : (
        <div>
          {/* Desktop table */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Property</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices?.map((invoice) => {
                    const StatusIcon = invoiceStatusConfig[invoice.status]?.icon || FileText;
                    return (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-mono font-medium">{invoice.invoice_number}</TableCell>
                        <TableCell>{invoice.property?.name || "-"}</TableCell>
                        <TableCell>{invoice.tenant?.name || "-"}</TableCell>
                        <TableCell className="font-semibold">{formatINR(invoice.amount)}</TableCell>
                        <TableCell>{format(new Date(invoice.due_date), "MMM d, yyyy")}</TableCell>
                        <TableCell>
                          <Badge variant={invoiceStatusConfig[invoice.status]?.variant || "secondary"}>
                            <StatusIcon className="w-3 h-3 mr-1" />
                            {invoice.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {invoice.status === "draft" && (
                              <Button variant="ghost" size="sm" onClick={() => handleSendInvoice(invoice.id)}>
                                <Send className="w-4 h-4 mr-1" />
                                Send
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => handleDownloadInvoice(invoice)} disabled={downloadingId === invoice.id}>
                              {downloadingId === invoice.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            </Button>
                          </div>
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
            {filteredInvoices?.map((invoice) => {
              const StatusIcon = invoiceStatusConfig[invoice.status]?.icon || FileText;
              return (
                <Card key={invoice.id}>
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between mb-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-sm font-medium">{invoice.invoice_number}</p>
                        <p className="text-xs text-muted-foreground truncate">{invoice.tenant?.name} • {invoice.property?.name}</p>
                      </div>
                      <Badge variant={invoiceStatusConfig[invoice.status]?.variant || "secondary"} className="text-xs ml-2 shrink-0">
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {invoice.status}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-lg font-bold">{formatINR(invoice.amount)}</span>
                      <span className="text-xs text-muted-foreground">Due: {format(new Date(invoice.due_date), "MMM d, yyyy")}</span>
                    </div>
                    <div className="flex gap-2 border-t border-white/5 pt-2">
                      {invoice.status === "draft" && (
                        <Button variant="ghost" size="sm" className="flex-1 h-8 text-xs" onClick={() => handleSendInvoice(invoice.id)}>
                          <Send className="w-3 h-3 mr-1" />
                          Send
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="flex-1 h-8 text-xs" onClick={() => handleDownloadInvoice(invoice)} disabled={downloadingId === invoice.id}>
                        {downloadingId === invoice.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3 mr-1" />}
                        Download
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Create Ad-hoc Invoice Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Ad-hoc Invoice</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            For non-rent charges. Rent invoices are generated automatically with payments.
          </p>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Property</Label>
              <SearchableSelect
                options={properties?.map((p) => ({ value: p.id, label: p.name })) || []}
                value={selectedProperty}
                onValueChange={(v) => {
                  setSelectedProperty(v);
                  setSelectedTenant("");
                }}
                placeholder="Select property"
                searchPlaceholder="Search properties..."
                triggerClassName="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label>Tenant</Label>
              <SearchableSelect
                options={propertyTenants?.map((t) => ({ value: t.id, label: t.name })) || []}
                value={selectedTenant}
                onValueChange={handleTenantSelect}
                placeholder="Select tenant"
                searchPlaceholder="Search tenants..."
                disabled={!selectedProperty}
                triggerClassName="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label>Amount (₹)</Label>
              <Input
                type="number"
                placeholder="25000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dueDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dueDate ? format(dueDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dueDate}
                    onSelect={setDueDate}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="hero"
                onClick={handleCreateInvoice}
                disabled={createInvoice.isPending || !selectedProperty || !selectedTenant || !amount || !dueDate}
              >
                Create Invoice
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Invoices;

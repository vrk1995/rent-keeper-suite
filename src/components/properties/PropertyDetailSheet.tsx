import { useState } from "react";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Building2,
  Users,
  Receipt,
  FileText,
  Wallet,
  Download,
  Edit,
  Trash2,
  MapPin,
  Layers,
  Square,
  IndianRupee,
  Plus,
  User,
} from "lucide-react";
import { Property } from "@/hooks/useProperties";
import { Tenant } from "@/hooks/useTenants";
import { useExpensesByProperty, useDeleteExpense } from "@/hooks/useExpenses";
import { useDocumentsByProperty, useDeleteDocument } from "@/hooks/useDocuments";
import { useInvoices } from "@/hooks/useInvoices";
import { usePayments } from "@/hooks/usePayments";
import { useIsAdmin } from "@/hooks/useUserRole";
import { useFloorUnitsByProperty } from "@/hooks/useFloorUnits";
import { useAllTenantFloorUnits } from "@/hooks/useTenantFloorUnits";
import { formatINR } from "@/lib/currency";
import { invoiceStatusConfig, occupancyStatusConfig } from "@/lib/statusConfig";
import { AddExpenseDialog } from "./AddExpenseDialog";
import { UploadDocumentDialog } from "./UploadDocumentDialog";
import AddPropertyDialog from "./AddPropertyDialog";
import AddTenantDialog from "@/components/tenants/AddTenantDialog";

interface PropertyDetailSheetProps {
  property: Property | null;
  tenants: Tenant[];
  floors: { id: string; floor_name: string; floor_sqft: number }[];
  floorRentedMap: Map<string, number>;
  rentData: { withoutGST: number; withGST: number; hasGST: boolean } | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleteProperty: (id: string) => void;
}

export function PropertyDetailSheet({
  property,
  tenants,
  floors,
  floorRentedMap,
  rentData,
  open,
  onOpenChange,
  onDeleteProperty,
}: PropertyDetailSheetProps) {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [tenantDialogOpen, setTenantDialogOpen] = useState(false);
  const [deleteExpenseId, setDeleteExpenseId] = useState<string | null>(null);
  const [deleteDocumentData, setDeleteDocumentData] = useState<{ id: string; file_url: string; name: string } | null>(null);
  const { isAdmin, isLoading: roleLoading } = useIsAdmin();

  const { data: expenses } = useExpensesByProperty(property?.id || "");
  const { data: documents, refetch: refetchDocuments } = useDocumentsByProperty(property?.id || "");
  const { data: allInvoices } = useInvoices();
  const { data: allPayments } = usePayments();
  const { data: floorUnits } = useFloorUnitsByProperty(property?.id);
  const { allTenantFloorUnits } = useAllTenantFloorUnits();
  const deleteExpense = useDeleteExpense();
  const deleteDocument = useDeleteDocument();

  if (!property) return null;

  // Filter invoices and payments for this property
  const propertyInvoices = allInvoices?.filter((inv) => inv.property_id === property.id) || [];
  const propertyPayments = allPayments?.filter((pay) => pay.property_id === property.id) || [];

  // Invoices aren't directly linked to payments by FK, so match on the same natural
  // key the DB's monthly-payment generator uses to avoid duplicates: tenant + due date + amount.
  const invoiceNumberByPayment = new Map<string, string>();
  propertyInvoices.forEach((inv) => {
    invoiceNumberByPayment.set(`${inv.tenant_id}|${inv.due_date}|${Number(inv.amount).toFixed(2)}`, inv.invoice_number);
  });
  const getInvoiceNumber = (p: (typeof propertyPayments)[number]) =>
    invoiceNumberByPayment.get(`${p.tenant_id}|${p.due_date}|${Number(p.amount).toFixed(2)}`) || "";

  const totalSqft = property.total_sqft || 0;
  const rentedSqft = tenants
    .filter((t) => t.status === "active")
    .reduce((sum, t) => sum + (t.rented_sqft || 0), 0);
  const utilizationPercent = totalSqft > 0 ? Math.min(100, (rentedSqft / totalSqft) * 100) : 0;

  const totalExpenses = expenses?.reduce((sum, e) => sum + e.amount, 0) || 0;

  // Build a proper debit/credit cash ledger for the property: rent collected posts as a
  // credit (cash in), expenses post as a debit (cash out). Running balance is net cash
  // position, matching the Financial Summary's Net Income figure.
  type LedgerEntry = {
    date: string;
    particulars: string;
    invoiceNumber: string;
    debit: number;
    credit: number;
  };
  const ledgerRows: LedgerEntry[] = [];
  propertyPayments.forEach((payment) => {
    const paidAmount = payment.paid_amount || 0;
    if (paidAmount > 0) {
      ledgerRows.push({
        date: payment.paid_date || payment.due_date,
        particulars: `Rent received — ${payment.tenant?.name || "Tenant"}`,
        invoiceNumber: getInvoiceNumber(payment),
        debit: 0,
        credit: paidAmount,
      });
    }
  });
  (expenses || []).forEach((expense) => {
    ledgerRows.push({
      date: expense.expense_date,
      particulars: expense.vendor_name ? `${expense.title} — ${expense.vendor_name}` : expense.title,
      invoiceNumber: "",
      debit: expense.amount,
      credit: 0,
    });
  });
  ledgerRows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  let runningBalance = 0;
  const ledgerEntries = ledgerRows.map((entry) => {
    runningBalance += entry.credit - entry.debit;
    return { ...entry, balance: runningBalance };
  });

  // Export ledger to Excel
  const handleExportLedger = () => {
    const ledgerData = ledgerEntries.map((entry) => ({
      Date: entry.date,
      Particulars: entry.particulars,
      "Invoice #": entry.invoiceNumber || "-",
      Debit: entry.debit || "",
      Credit: entry.credit || "",
      Balance: entry.balance,
    }));

    // Create workbook with multiple sheets
    const wb = XLSX.utils.book_new();

    // Ledger sheet
    const ledgerWs = XLSX.utils.json_to_sheet(ledgerData);
    XLSX.utils.book_append_sheet(wb, ledgerWs, "Ledger");

    // Summary sheet
    const totalRentCollected = propertyPayments.reduce((sum, p) => sum + (p.paid_amount || 0), 0);
    const totalRentPending = propertyPayments.reduce(
      (sum, p) => sum + Math.max(0, p.amount - (p.paid_amount || 0)),
      0
    );

    const summaryData = [
      { Metric: "Total Rent Collected", Value: totalRentCollected },
      { Metric: "Total Rent Pending", Value: totalRentPending },
      { Metric: "Total Expenses", Value: totalExpenses },
      { Metric: "Net Income", Value: totalRentCollected - totalExpenses },
    ];
    const summaryWs = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");

    // Download
    XLSX.writeFile(wb, `${property.name}_Ledger_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  const handleDeleteExpense = async () => {
    if (deleteExpenseId && property) {
      await deleteExpense.mutateAsync({ id: deleteExpenseId, propertyId: property.id });
      setDeleteExpenseId(null);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-2xl w-full p-0">
          <SheetHeader className="p-6 pb-4 border-b">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <SheetTitle className="text-xl">{property.name}</SheetTitle>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                    <MapPin className="w-3 h-3" />
                    {property.address}
                    <Badge variant={occupancyStatusConfig[property.status] || "secondary"}>
                      {property.status}
                    </Badge>
                  </div>
                </div>
              </div>
              {isAdmin && !roleLoading && (
                <div className="flex gap-2">
                  <Button variant="outline" size="icon" aria-label="Edit property" onClick={() => setEditDialogOpen(true)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Delete property"
                    onClick={() => {
                      onDeleteProperty(property.id);
                      onOpenChange(false);
                    }}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              )}
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-3 mt-4">
              <Card className="bg-muted/30">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <Square className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">SQFT</span>
                  </div>
                  <p className="text-lg font-semibold mt-1">
                    {rentedSqft.toLocaleString()}/{totalSqft.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">{utilizationPercent.toFixed(0)}% utilized</p>
                </CardContent>
              </Card>
              <Card className="bg-muted/30">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <IndianRupee className="w-4 h-4 text-green-500" />
                    <span className="text-xs text-muted-foreground">Monthly Rent</span>
                  </div>
                  <p className="text-lg font-semibold mt-1 text-success">
                    {formatINR(rentData?.withoutGST || 0)}
                  </p>
                  {rentData?.hasGST && (
                    <p className="text-xs text-muted-foreground">With GST: {formatINR(rentData.withGST)}</p>
                  )}
                </CardContent>
              </Card>
              <Card className="bg-muted/30">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Floors</span>
                  </div>
                  <p className="text-lg font-semibold mt-1">{floors.length || property.floors_owned}</p>
                  <p className="text-xs text-muted-foreground">{tenants.length} tenants</p>
                </CardContent>
              </Card>
            </div>
          </SheetHeader>

          <Tabs defaultValue="tenants" className="flex-1">
            <TabsList className="w-full justify-start px-6 py-2 h-auto bg-transparent border-b rounded-none overflow-x-auto">
              <TabsTrigger value="tenants" className="gap-2">
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">Tenants</span>
              </TabsTrigger>
              <TabsTrigger value="units" className="gap-2">
                <Building2 className="w-4 h-4" />
                <span className="hidden sm:inline">Corp Nos.</span>
              </TabsTrigger>
              <TabsTrigger value="expenses" className="gap-2">
                <Wallet className="w-4 h-4" />
                <span className="hidden sm:inline">Expenses</span>
              </TabsTrigger>
              <TabsTrigger value="documents" className="gap-2">
                <FileText className="w-4 h-4" />
                <span className="hidden sm:inline">Documents</span>
              </TabsTrigger>
              <TabsTrigger value="invoices" className="gap-2">
                <Receipt className="w-4 h-4" />
                <span className="hidden sm:inline">Invoices</span>
              </TabsTrigger>
              <TabsTrigger value="ledger" className="gap-2">
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Ledger</span>
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="h-[calc(100vh-350px)]">
              {/* Tenants Tab */}
              <TabsContent value="tenants" className="p-6 m-0">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Tenants</p>
                    <p className="text-xl font-bold">{tenants.length}</p>
                  </div>
                  <Button size="sm" onClick={() => setTenantDialogOpen(true)}>
                    <Plus className="w-4 h-4 mr-1" />
                    Add Tenant
                  </Button>
                </div>

                {tenants.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No tenants in this property yet
                  </div>
                ) : (
                  <div className="space-y-3">
                    {tenants.map((tenant) => (
                      <Card key={tenant.id}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{tenant.name}</span>
                                <Badge variant={tenant.status === "active" ? "glow" : "secondary"}>
                                  {tenant.status}
                                </Badge>
                                {tenant.requires_gst && (
                                  <Badge variant="outline" className="text-xs">
                                    GST
                                  </Badge>
                                )}
                              </div>
                              <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
                                {tenant.floor && <p>Floor: {tenant.floor.floor_name}</p>}
                                <p>Rented: {tenant.rented_sqft?.toLocaleString()} sq.ft</p>
                                <p>Lease: {tenant.lease_start_date} to {tenant.lease_end_date}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-semibold text-success">
                                {formatINR(tenant.monthly_rent || 0)}
                              </p>
                              <p className="text-xs text-muted-foreground">Due: {tenant.rent_due_day}th</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Corp Nos. Tab */}
              <TabsContent value="units" className="p-6 m-0">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Corp Nos.</p>
                    <p className="text-xl font-bold">{floorUnits?.length || 0}</p>
                  </div>
                  {isAdmin && !roleLoading && (
                    <Button size="sm" variant="outline" onClick={() => setEditDialogOpen(true)}>
                      <Edit className="w-4 h-4 mr-1" />
                      Edit Corp Nos.
                    </Button>
                  )}
                </div>

                {(!floorUnits || floorUnits.length === 0) ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No corp numbers added yet. Click "Edit Corp Nos." above to add them.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {floors.map((floor) => {
                      const unitsOnFloor = floorUnits.filter(u => u.floor_id === floor.id);
                      if (unitsOnFloor.length === 0) return null;
                      return (
                        <div key={floor.id}>
                          <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                            Floor: {floor.floor_name}
                          </p>
                          <div className="space-y-2">
                            {unitsOnFloor.map((u) => {
                              const occupants = allTenantFloorUnits?.filter(
                                tfu => tfu.floor_unit_id === u.id && tfu.tenants?.status === "active"
                              ) || [];
                              return (
                                <Card key={u.id}>
                                  <CardContent className="p-3 flex items-center justify-between">
                                    <div>
                                      <p className="font-medium">{u.corp_number}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {Number(u.area_sqft).toLocaleString()} sq.ft
                                      </p>
                                    </div>
                                    {occupants.length > 0 ? (
                                      <Badge variant={occupancyStatusConfig.occupied}>
                                        Occupied — {occupants.map(o => o.tenants?.name).join(", ")}
                                      </Badge>
                                    ) : (
                                      <Badge variant={occupancyStatusConfig.vacant}>Vacant</Badge>
                                    )}
                                  </CardContent>
                                </Card>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>


              {/* Expenses Tab */}
              <TabsContent value="expenses" className="p-6 m-0">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Expenses</p>
                    <p className="text-xl font-bold text-destructive">{formatINR(totalExpenses)}</p>
                  </div>
                  {isAdmin && !roleLoading && <AddExpenseDialog propertyId={property.id} />}
                </div>

                {(!expenses || expenses.length === 0) ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No expenses recorded yet
                  </div>
                ) : (
                  <div className="space-y-3">
                    {expenses.map((expense) => (
                      <Card key={expense.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{expense.title}</span>
                                {expense.category && (
                                  <Badge variant="outline">{expense.category}</Badge>
                                )}
                              </div>
                              <div className="text-sm text-muted-foreground mt-1">
                                <p>Date: {expense.expense_date}</p>
                                {expense.vendor_name && <p>Vendor: {expense.vendor_name}</p>}
                                {expense.description && <p className="mt-1">{expense.description}</p>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <p className="text-lg font-semibold text-destructive">
                                -{formatINR(expense.amount)}
                              </p>
                              {isAdmin && !roleLoading && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Delete expense"
                                  onClick={() => setDeleteExpenseId(expense.id)}
                                >
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Documents Tab */}
              <TabsContent value="documents" className="p-6 m-0">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Documents</p>
                    <p className="text-xl font-bold">{documents?.length || 0}</p>
                  </div>
                  <UploadDocumentDialog propertyId={property.id} tenants={tenants} />
                </div>

                {(!documents || documents.length === 0) ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No documents uploaded yet
                  </div>
                ) : (
                  <div className="space-y-3">
                    {documents.map((doc) => {
                      const linkedTenant = tenants.find(t => t.id === doc.tenant_id);
                      return (
                        <Card key={doc.id}>
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <FileText className="w-5 h-5 text-muted-foreground" />
                                <div>
                                  <p className="font-medium">{doc.name}</p>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span>{doc.document_type}</span>
                                    <span>•</span>
                                    <span>{format(new Date(doc.created_at), "PPP")}</span>
                                    {linkedTenant && (
                                      <>
                                        <span>•</span>
                                        <span className="flex items-center gap-1 text-primary">
                                          <User className="w-3 h-3" />
                                          {linkedTenant.name}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" asChild>
                                  <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                                    <Download className="w-4 h-4 mr-1" />
                                    View
                                  </a>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Delete document"
                                  onClick={() => setDeleteDocumentData({ id: doc.id, file_url: doc.file_url, name: doc.name })}
                                >
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              {/* Invoices Tab */}
              <TabsContent value="invoices" className="p-6 m-0">
                {propertyInvoices.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No invoices for this property
                  </div>
                ) : (
                  <>
                    <div className="hidden sm:block">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Invoice #</TableHead>
                            <TableHead>Tenant</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Due Date</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {propertyInvoices.map((invoice) => (
                            <TableRow key={invoice.id}>
                              <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                              <TableCell>{invoice.tenant?.name || "Unknown"}</TableCell>
                              <TableCell>{formatINR(invoice.amount)}</TableCell>
                              <TableCell>{invoice.due_date}</TableCell>
                              <TableCell>
                                <Badge variant={invoiceStatusConfig[invoice.status]?.variant || "secondary"}>
                                  {invoice.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Mobile card list */}
                    <div className="sm:hidden space-y-2">
                      {propertyInvoices.map((invoice) => (
                        <Card key={invoice.id}>
                          <CardContent className="p-3 flex items-center justify-between">
                            <div className="min-w-0">
                              <p className="font-medium text-sm">{invoice.invoice_number}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {invoice.tenant?.name || "Unknown"} • {invoice.due_date}
                              </p>
                            </div>
                            <div className="text-right ml-2 shrink-0">
                              <p className="font-semibold text-sm">{formatINR(invoice.amount)}</p>
                              <Badge variant={invoiceStatusConfig[invoice.status]?.variant || "secondary"} className="text-xs">
                                {invoice.status}
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </>
                )}
              </TabsContent>

              {/* Ledger Tab */}
              <TabsContent value="ledger" className="p-6 m-0">
                <Card className="mb-4">
                  <CardHeader>
                    <CardTitle className="text-lg">Financial Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Collected</p>
                        <p className="text-xl font-bold text-success">
                          {formatINR(
                            propertyPayments
                              .filter((p) => p.status === "paid")
                              .reduce((sum, p) => sum + p.amount, 0)
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Total Pending</p>
                        <p className="text-xl font-bold text-warning">
                          {formatINR(
                            propertyPayments
                              .filter((p) => p.status === "pending" || p.status === "overdue")
                              .reduce((sum, p) => sum + p.amount, 0)
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Total Expenses</p>
                        <p className="text-xl font-bold text-destructive">{formatINR(totalExpenses)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Net Income</p>
                        <p className="text-xl font-bold">
                          {formatINR(
                            propertyPayments
                              .filter((p) => p.status === "paid")
                              .reduce((sum, p) => sum + p.amount, 0) - totalExpenses
                          )}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Button onClick={handleExportLedger} className="w-full">
                  <Download className="w-4 h-4 mr-2" />
                  Download Ledger (Excel)
                </Button>

                {/* Ledger */}
                <div className="mt-6">
                  <h4 className="font-medium mb-3">Ledger</h4>
                  {ledgerEntries.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No transactions yet</p>
                  ) : (
                    <>
                      {/* Desktop table */}
                      <div className="hidden sm:block border rounded-lg overflow-x-auto">
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
                                <TableCell className="text-xs text-right text-destructive">
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
                          </TableBody>
                        </Table>
                      </div>

                      {/* Mobile cards */}
                      <div className="sm:hidden space-y-2">
                        {ledgerEntries.map((entry, idx) => (
                          <div key={idx} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                            <div>
                              <p className="font-medium text-sm">{entry.particulars}</p>
                              <p className="text-xs text-muted-foreground">
                                {entry.invoiceNumber && <span className="font-mono">{entry.invoiceNumber} • </span>}
                                {format(new Date(entry.date), "dd MMM yy")}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className={`font-semibold ${entry.credit > 0 ? "text-success" : "text-destructive"}`}>
                                {entry.credit > 0 ? formatINR(entry.credit) : `-${formatINR(entry.debit)}`}
                              </p>
                              <p className="text-xs text-muted-foreground">Bal: {formatINR(entry.balance)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </SheetContent>
      </Sheet>

      {/* Edit Property Dialog */}
      <AddPropertyDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        editProperty={property}
      />

      {/* Add Tenant Dialog */}
      <AddTenantDialog
        open={tenantDialogOpen}
        onOpenChange={setTenantDialogOpen}
        defaultPropertyId={property.id}
      />

      {/* Delete Expense Confirmation */}
      <AlertDialog open={!!deleteExpenseId} onOpenChange={() => setDeleteExpenseId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Expense</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this expense? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteExpense}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Document Confirmation */}
      <AlertDialog open={!!deleteDocumentData} onOpenChange={() => setDeleteDocumentData(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteDocumentData?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deleteDocumentData) {
                  await deleteDocument.mutateAsync({
                    id: deleteDocumentData.id,
                    file_url: deleteDocumentData.file_url,
                    name: deleteDocumentData.name,
                    property_id: property.id,
                    tenant_id: null,
                    uploaded_by: "",
                    document_type: "",
                    created_at: "",
                  });
                  setDeleteDocumentData(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

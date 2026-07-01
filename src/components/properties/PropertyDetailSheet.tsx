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
import { formatINR } from "@/lib/currency";
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
  const deleteExpense = useDeleteExpense();
  const deleteDocument = useDeleteDocument();

  if (!property) return null;

  // Filter invoices and payments for this property
  const propertyInvoices = allInvoices?.filter((inv) => inv.property_id === property.id) || [];
  const propertyPayments = allPayments?.filter((pay) => pay.property_id === property.id) || [];

  const totalSqft = property.total_sqft || 0;
  const rentedSqft = tenants
    .filter((t) => t.status === "active")
    .reduce((sum, t) => sum + (t.rented_sqft || 0), 0);
  const utilizationPercent = totalSqft > 0 ? Math.min(100, (rentedSqft / totalSqft) * 100) : 0;

  const totalExpenses = expenses?.reduce((sum, e) => sum + e.amount, 0) || 0;

  // Export ledger to Excel
  const handleExportLedger = () => {
    const ledgerData = propertyPayments.map((payment) => ({
      "Due Date": payment.due_date,
      Tenant: payment.tenant?.name || "Unknown",
      Amount: payment.amount,
      Status: payment.status,
      "Paid Date": payment.paid_date || "-",
      "Payment Method": payment.payment_method || "-",
      Notes: payment.notes || "-",
    }));

    const expenseData = (expenses || []).map((expense) => ({
      Date: expense.expense_date,
      Title: expense.title,
      Category: expense.category || "General",
      Vendor: expense.vendor_name || "-",
      Amount: -expense.amount, // Negative for expenses
      "Payment Method": expense.payment_method || "-",
    }));

    // Create workbook with multiple sheets
    const wb = XLSX.utils.book_new();

    // Rent Collections sheet
    const rentWs = XLSX.utils.json_to_sheet(ledgerData);
    XLSX.utils.book_append_sheet(wb, rentWs, "Rent Collections");

    // Expenses sheet
    const expenseWs = XLSX.utils.json_to_sheet(expenseData);
    XLSX.utils.book_append_sheet(wb, expenseWs, "Expenses");

    // Summary sheet
    const totalRentCollected = propertyPayments
      .filter((p) => p.status === "paid")
      .reduce((sum, p) => sum + p.amount, 0);
    const totalRentPending = propertyPayments
      .filter((p) => p.status === "pending" || p.status === "overdue")
      .reduce((sum, p) => sum + p.amount, 0);

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
                    <Badge variant={property.status === "occupied" ? "glow" : "secondary"}>
                      {property.status}
                    </Badge>
                  </div>
                </div>
              </div>
              {isAdmin && !roleLoading && (
                <div className="flex gap-2">
                  <Button variant="outline" size="icon" onClick={() => setEditDialogOpen(true)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
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
                  <p className="text-lg font-semibold mt-1 text-green-600">
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
                Tenants
              </TabsTrigger>
              <TabsTrigger value="units" className="gap-2">
                <Building2 className="w-4 h-4" />
                Corp Nos.
              </TabsTrigger>
              <TabsTrigger value="expenses" className="gap-2">
                <Wallet className="w-4 h-4" />
                Expenses
              </TabsTrigger>
              <TabsTrigger value="documents" className="gap-2">
                <FileText className="w-4 h-4" />
                Documents
              </TabsTrigger>
              <TabsTrigger value="invoices" className="gap-2">
                <Receipt className="w-4 h-4" />
                Invoices
              </TabsTrigger>
              <TabsTrigger value="ledger" className="gap-2">
                <Download className="w-4 h-4" />
                Ledger
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
                              <p className="text-lg font-semibold text-green-600">
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
                <div className="mb-4">
                  <p className="text-sm text-muted-foreground">Total Corp Nos.</p>
                  <p className="text-xl font-bold">{floorUnits?.length || 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Manage corp numbers by editing the property and expanding each floor.
                  </p>
                </div>

                {(!floorUnits || floorUnits.length === 0) ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No corp numbers added yet. Edit the property to add them.
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
                              const occupant = tenants.find(
                                t => t.floor_unit_id === u.id && t.status === "active"
                              );
                              return (
                                <Card key={u.id}>
                                  <CardContent className="p-3 flex items-center justify-between">
                                    <div>
                                      <p className="font-medium">{u.corp_number}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {Number(u.area_sqft).toLocaleString()} sq.ft
                                      </p>
                                    </div>
                                    {occupant ? (
                                      <Badge variant="glow">Occupied — {occupant.name}</Badge>
                                    ) : (
                                      <Badge variant="secondary">Vacant</Badge>
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
                            <Badge
                              variant={
                                invoice.status === "paid"
                                  ? "glow"
                                  : invoice.status === "overdue"
                                  ? "destructive"
                                  : "secondary"
                              }
                            >
                              {invoice.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
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
                        <p className="text-xl font-bold text-green-600">
                          {formatINR(
                            propertyPayments
                              .filter((p) => p.status === "paid")
                              .reduce((sum, p) => sum + p.amount, 0)
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Total Pending</p>
                        <p className="text-xl font-bold text-orange-600">
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

                {/* Recent Transactions */}
                <div className="mt-6">
                  <h4 className="font-medium mb-3">Recent Transactions</h4>
                  <div className="space-y-2">
                    {propertyPayments.slice(0, 10).map((payment) => (
                      <div
                        key={payment.id}
                        className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                      >
                        <div>
                          <p className="font-medium">{payment.tenant?.name}</p>
                          <p className="text-xs text-muted-foreground">Due: {payment.due_date}</p>
                        </div>
                        <div className="text-right">
                          <p
                            className={`font-semibold ${
                              payment.status === "paid" ? "text-green-600" : "text-orange-600"
                            }`}
                          >
                            {formatINR(payment.amount)}
                          </p>
                          <Badge
                            variant={
                              payment.status === "paid"
                                ? "glow"
                                : payment.status === "overdue"
                                ? "destructive"
                                : "secondary"
                            }
                            className="text-xs"
                          >
                            {payment.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
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

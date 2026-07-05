import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Trash2, Receipt } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useAllExpenses, useDeleteExpense } from "@/hooks/useExpenses";
import { useFilterOptions } from "@/hooks/useFilterOptions";
import { formatINR } from "@/lib/currency";
import { AddAdhocPaymentDialog } from "@/components/payments/AddAdhocPaymentDialog";
import { RowListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";

const categoryOptions = [
  { value: "taxes", label: "Taxes" },
  { value: "repairs", label: "Repairs" },
  { value: "maintenance", label: "Maintenance" },
  { value: "utilities", label: "Utilities" },
  { value: "insurance", label: "Insurance" },
  { value: "legal", label: "Legal" },
  { value: "cleaning", label: "Cleaning" },
  { value: "security", label: "Security" },
  { value: "general", label: "General" },
];

export default function PaymentsLog() {
  const { data: expenses = [], isLoading, isError, refetch } = useAllExpenses();
  const { propertyOptions } = useFilterOptions();
  const deleteExpense = useDeleteExpense();

  const [propertyFilter, setPropertyFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [deleteExpenseData, setDeleteExpenseData] = useState<{ id: string; propertyId: string; title: string } | null>(null);

  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      if (propertyFilter && e.property_id !== propertyFilter) return false;
      if (categoryFilter && e.category !== categoryFilter) return false;
      return true;
    });
  }, [expenses, propertyFilter, categoryFilter]);

  const total = useMemo(
    () => filtered.reduce((sum, e) => sum + Number(e.amount || 0), 0),
    [filtered]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold">Payments</h1>
          <p className="text-muted-foreground text-sm">
            Track ad-hoc outflows like taxes, repairs, and other expenses
          </p>
        </div>
        <AddAdhocPaymentDialog />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Payments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatINR(total)}</div>
            <p className="text-xs text-muted-foreground">{filtered.length} records</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="sm:w-64">
              <SearchableSelect
                options={propertyOptions}
                value={propertyFilter}
                onValueChange={setPropertyFilter}
                placeholder="All properties"
                allOption
                allLabel="All properties"
              />
            </div>
            <div className="sm:w-64">
              <SearchableSelect
                options={categoryOptions}
                value={categoryFilter}
                onValueChange={setCategoryFilter}
                placeholder="All categories"
                allOption
                allLabel="All categories"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <RowListSkeleton />
          ) : isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No payments recorded yet"
              description='Use "Record Ad-hoc Payment" above to log a tax, repair, or other expense.'
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Property</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Paid By</TableHead>
                    <TableHead>Method</TableHead>

                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(e.expense_date), "dd MMM yyyy")}
                      </TableCell>
                      <TableCell className="font-medium">{e.title}</TableCell>
                      <TableCell>{e.property?.name || "—"}</TableCell>
                      <TableCell>
                        {e.category ? (
                          <Badge variant="secondary" className="capitalize">
                            {e.category}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>{e.vendor_name || "—"}</TableCell>
                      <TableCell>{e.paid_by || "—"}</TableCell>
                      <TableCell className="capitalize">
                        {e.payment_method?.replace("_", " ") || "—"}
                      </TableCell>

                      <TableCell className="text-right font-semibold">
                        {formatINR(Number(e.amount))}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Delete payment"
                          onClick={() =>
                            setDeleteExpenseData({ id: e.id, propertyId: e.property_id, title: e.title })
                          }
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteExpenseData} onOpenChange={() => setDeleteExpenseData(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Payment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteExpenseData?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteExpenseData) {
                  deleteExpense.mutate({ id: deleteExpenseData.id, propertyId: deleteExpenseData.propertyId });
                  setDeleteExpenseData(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

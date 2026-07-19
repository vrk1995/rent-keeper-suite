import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Trash2, Receipt, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

  const [searchQuery, setSearchQuery] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState("date_desc");
  const [deleteExpenseData, setDeleteExpenseData] = useState<{ id: string; propertyId: string; title: string } | null>(null);

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const list = expenses.filter((e) => {
      if (propertyFilter && e.property_id !== propertyFilter) return false;
      if (categoryFilter && e.category !== categoryFilter) return false;
      if (dateFrom && e.expense_date < dateFrom) return false;
      if (dateTo && e.expense_date > dateTo) return false;
      if (query) {
        const matchesSearch =
          e.title.toLowerCase().includes(query) ||
          e.vendor_name?.toLowerCase().includes(query) ||
          e.property?.name?.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }
      return true;
    });
    return list.sort((a, b) => {
      switch (sortBy) {
        case "date_asc":
          return a.expense_date.localeCompare(b.expense_date);
        case "date_desc":
          return b.expense_date.localeCompare(a.expense_date);
        case "amount_desc":
          return Number(b.amount || 0) - Number(a.amount || 0);
        case "amount_asc":
          return Number(a.amount || 0) - Number(b.amount || 0);
        case "title_asc":
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });
  }, [expenses, propertyFilter, categoryFilter, dateFrom, dateTo, searchQuery, sortBy]);

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
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by title, vendor, property..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
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
            <div className="flex items-center gap-2">
              <Label htmlFor="date-from" className="text-xs text-muted-foreground shrink-0">From</Label>
              <Input
                id="date-from"
                type="date"
                className="w-full sm:w-40"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
              <Label htmlFor="date-to" className="text-xs text-muted-foreground shrink-0">To</Label>
              <Input
                id="date-to"
                type="date"
                className="w-full sm:w-40"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="sm:w-52">
              <SearchableSelect
                options={[
                  { value: "date_desc", label: "Date (newest)" },
                  { value: "date_asc", label: "Date (oldest)" },
                  { value: "amount_desc", label: "Amount (high to low)" },
                  { value: "amount_asc", label: "Amount (low to high)" },
                  { value: "title_asc", label: "Title (A–Z)" },
                ]}
                value={sortBy}
                onValueChange={setSortBy}
                placeholder="Sort by"
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
            <>
              <div className="hidden md:block overflow-x-auto">
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

              {/* Mobile card list */}
              <div className="md:hidden space-y-3">
                {filtered.map((e) => (
                  <Card key={e.id} className="overflow-hidden">
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between mb-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">{e.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{e.property?.name || "—"}</p>
                        </div>
                        {e.category && (
                          <Badge variant="secondary" className="text-xs ml-2 shrink-0 capitalize">
                            {e.category}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-lg font-bold">{formatINR(Number(e.amount))}</span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(e.expense_date), "dd MMM yyyy")}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                        <span>{e.vendor_name ? `Vendor: ${e.vendor_name}` : "—"}</span>
                        <span className="capitalize">{e.payment_method?.replace("_", " ") || "—"}</span>
                      </div>
                      <div className="flex justify-end border-t border-white/5 pt-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs text-destructive hover:text-destructive"
                          aria-label="Delete payment"
                          onClick={() =>
                            setDeleteExpenseData({ id: e.id, propertyId: e.property_id, title: e.title })
                          }
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
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

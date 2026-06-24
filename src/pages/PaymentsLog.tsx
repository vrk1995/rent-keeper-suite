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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useAllExpenses, useDeleteExpense } from "@/hooks/useExpenses";
import { useFilterOptions } from "@/hooks/useFilterOptions";
import { formatINR } from "@/lib/currency";
import { AddAdhocPaymentDialog } from "@/components/payments/AddAdhocPaymentDialog";

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
  const { data: expenses = [], isLoading } = useAllExpenses();
  const { propertyOptions } = useFilterOptions();
  const deleteExpense = useDeleteExpense();

  const [propertyFilter, setPropertyFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

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
            <p className="text-muted-foreground text-sm">Loading...</p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Receipt className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No payments recorded yet</p>
            </div>
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
                          onClick={() =>
                            deleteExpense.mutate({ id: e.id, propertyId: e.property_id })
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
    </div>
  );
}

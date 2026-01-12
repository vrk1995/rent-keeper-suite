import { useState } from "react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { Plus, Search, CreditCard, CheckCircle, Clock, AlertCircle, Building2 } from "lucide-react";
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
import { usePayments, useMarkPaymentPaid, RentPayment } from "@/hooks/usePayments";
import { formatINR } from "@/lib/currency";

const statusConfig: Record<string, { icon: React.ElementType; variant: "glow" | "secondary" | "destructive" }> = {
  paid: { icon: CheckCircle, variant: "glow" },
  pending: { icon: Clock, variant: "secondary" },
  overdue: { icon: AlertCircle, variant: "destructive" },
  partial: { icon: Clock, variant: "secondary" },
};

const Payments = () => {
  const { data: payments, isLoading } = usePayments();
  const markPaid = useMarkPaymentPaid();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

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

  const handleMarkPaid = async (payment: RentPayment) => {
    await markPaid.mutateAsync({ id: payment.id, payment_method: "manual" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Payments</h1>
          <p className="text-muted-foreground">Track and manage rent payments</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
          <p className="text-muted-foreground">
            Payments will appear here when tenants are added
          </p>
        </motion.div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Property</TableHead>
                  <TableHead>Tenant</TableHead>
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
                      <TableCell className="text-right">
                        {payment.status !== "paid" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleMarkPaid(payment)}
                            disabled={markPaid.isPending}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Mark Paid
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
    </div>
  );
};

export default Payments;

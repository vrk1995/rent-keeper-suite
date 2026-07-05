import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Building2,
  DollarSign,
  Calendar,
  AlertCircle,
  TrendingUp,
  Plus,
  ArrowUpRight,
  Users,
  Clock,
  AlertTriangle,
  CheckCircle,
  UserPlus,
} from "lucide-react";
import { useProperties } from "@/hooks/useProperties";
import { useTenants } from "@/hooks/useTenants";
import { usePayments, RentPayment } from "@/hooks/usePayments";
import { formatINR } from "@/lib/currency";
import { paymentStatusConfig, occupancyStatusConfig } from "@/lib/statusConfig";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { format, differenceInDays, isToday, isTomorrow } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import AddPropertyDialog from "@/components/properties/AddPropertyDialog";
import AddTenantDialog from "@/components/tenants/AddTenantDialog";
import { MarkPaidDialog } from "@/components/payments/MarkPaidDialog";

const DashboardOverview = () => {
  const navigate = useNavigate();
  const { data: properties = [], isLoading: propertiesLoading, isError: propertiesError, refetch: refetchProperties } = useProperties();
  const { data: tenants = [], isLoading: tenantsLoading, isError: tenantsError, refetch: refetchTenants } = useTenants();
  const { data: payments = [], isLoading: paymentsLoading, isError: paymentsError, refetch: refetchPayments } = usePayments();
  const [addPropertyOpen, setAddPropertyOpen] = useState(false);
  const [addTenantOpen, setAddTenantOpen] = useState(false);
  const [markPaidPayment, setMarkPaidPayment] = useState<RentPayment | null>(null);

  // Calculate payment stats
  const paymentStats = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    const currentMonthPayments = payments.filter(p => {
      const dueDate = new Date(p.due_date);
      return dueDate.getMonth() === currentMonth && dueDate.getFullYear() === currentYear;
    });

    const overdue = payments.filter(p => p.status === 'overdue');
    const pending = payments.filter(p => p.status === 'pending');
    const upcoming = pending
      .filter(p => {
        const daysUntil = differenceInDays(new Date(p.due_date), now);
        return daysUntil >= 0 && daysUntil <= 7;
      })
      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

    const overdueAmount = overdue.reduce((sum, p) => sum + p.amount, 0);
    const pendingAmount = pending.reduce((sum, p) => sum + p.amount, 0);

    return {
      overdue,
      overdueCount: overdue.length,
      overdueAmount,
      pending,
      pendingCount: pending.length,
      pendingAmount,
      upcoming,
      upcomingCount: upcoming.length,
    };
  }, [payments]);

  const totalMonthlyRent = tenants
    .filter(t => t.status === 'active')
    .reduce((sum, t) => sum + (t.monthly_rent || 0), 0);

  const stats = [
    {
      title: "Total Properties",
      value: properties.length.toString(),
      change: properties.length > 0 ? `${properties.length} active` : "No properties yet",
      icon: Building2,
      trend: "up",
    },
    {
      title: "Total Tenants",
      value: tenants.length.toString(),
      change: tenants.length > 0 ? `${tenants.filter(t => t.status === 'active').length} active` : "No tenants yet",
      icon: Users,
      trend: "up",
    },
    {
      title: "Monthly Collectible",
      value: formatINR(totalMonthlyRent),
      change: "From active tenants",
      icon: DollarSign,
      trend: "up",
    },
    {
      title: "Overdue Payments",
      value: paymentStats.overdueCount.toString(),
      change: paymentStats.overdueAmount > 0 ? `${formatINR(paymentStats.overdueAmount)} outstanding` : "All clear",
      icon: AlertCircle,
      trend: paymentStats.overdueCount > 0 ? "warning" : "up",
      highlight: paymentStats.overdueCount > 0,
    },
  ];

  const isLoading = propertiesLoading || tenantsLoading || paymentsLoading;
  const isError = propertiesError || tenantsError || paymentsError;
  const refetchAll = () => {
    refetchProperties();
    refetchTenants();
    refetchPayments();
  };

  const getDueDateLabel = (dueDate: string) => {
    const date = new Date(dueDate);
    if (isToday(date)) return "Today";
    if (isTomorrow(date)) return "Tomorrow";
    const days = differenceInDays(date, new Date());
    if (days < 0) return `${Math.abs(days)} days overdue`;
    return `In ${days} days`;
  };

  return (
    <div className="space-y-6">
      {/* Welcome message */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold">Dashboard</h1>
          <p className="text-sm md:text-base text-muted-foreground">Welcome back! Here's your rental overview.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="w-fit" onClick={() => setAddTenantOpen(true)}>
            <UserPlus className="w-4 h-4 mr-2" />
            Add Tenant
          </Button>
          <Button variant="hero" size="sm" className="w-fit" onClick={() => setAddPropertyOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Property
          </Button>
        </div>
      </div>

      {isError ? (
        <ErrorState onRetry={refetchAll} />
      ) : (
      <>
      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {stats.map((stat) => (
          <Card 
            key={stat.title} 
            className={`hover:border-primary/30 transition-all ${
              stat.highlight ? 'border-destructive/50 bg-destructive/5' : ''
            }`}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                stat.highlight ? 'bg-destructive/10' : 'bg-primary/10'
              }`}>
                <stat.icon className={`w-5 h-5 ${stat.highlight ? 'text-destructive' : 'text-primary'}`} />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20 mb-1" />
              ) : (
                <div className={`text-xl md:text-3xl font-display font-bold ${stat.highlight ? 'text-destructive' : ''}`}>
                  {stat.value}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                {stat.trend === "up" && <TrendingUp className="w-3 h-3 text-success" />}
                {stat.trend === "warning" && <AlertTriangle className="w-3 h-3 text-destructive" />}
                {isLoading ? <Skeleton className="h-3 w-24" /> : stat.change}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Payment Reminders Widget */}
      {(paymentStats.overdueCount > 0 || paymentStats.upcomingCount > 0) && (
        <Card className="border-orange-500/30 bg-gradient-to-r from-orange-500/5 to-transparent">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/10">
                <Clock className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <CardTitle>Payment Reminders</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {paymentStats.overdueCount > 0 && (
                    <span className="text-destructive font-medium">{paymentStats.overdueCount} overdue</span>
                  )}
                  {paymentStats.overdueCount > 0 && paymentStats.upcomingCount > 0 && " • "}
                  {paymentStats.upcomingCount > 0 && (
                    <span>{paymentStats.upcomingCount} due this week</span>
                  )}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="hidden sm:flex" onClick={() => navigate('/dashboard/payments')}>
              View All Payments
              <ArrowUpRight className="w-4 h-4 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {/* Overdue payments first */}
              {paymentStats.overdue.slice(0, 3).map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-destructive/10 border border-destructive/20"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{payment.tenant?.name || "Unknown"}</p>
                    <p className="text-xs text-muted-foreground truncate">{payment.property?.name}</p>
                  </div>
                  <div className="text-right ml-2">
                    <p className="font-semibold text-destructive">{formatINR(payment.amount)}</p>
                    <Badge variant="destructive" className="text-xs">
                      {getDueDateLabel(payment.due_date)}
                    </Badge>
                  </div>
                </div>
              ))}
              {/* Upcoming payments */}
              {paymentStats.upcoming.slice(0, 3 - Math.min(paymentStats.overdue.length, 3)).map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-orange-500/10 border border-orange-500/20"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{payment.tenant?.name || "Unknown"}</p>
                    <p className="text-xs text-muted-foreground truncate">{payment.property?.name}</p>
                  </div>
                  <div className="text-right ml-2">
                    <p className="font-semibold">{formatINR(payment.amount)}</p>
                    <Badge variant="secondary" className="text-xs bg-orange-500/20 text-orange-600 dark:text-orange-400">
                      {getDueDateLabel(payment.due_date)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Payments */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Payments</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/payments')}>
              View All
              <ArrowUpRight className="w-4 h-4 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 bg-secondary/30 rounded-lg" />
                  ))}
                </div>
              ) : payments.length === 0 ? (
                <p className="text-muted-foreground text-sm">No payments yet. Generate monthly payments to get started!</p>
              ) : (
                payments.slice(0, 4).map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-white/5"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{payment.tenant?.name || "Unknown Tenant"}</p>
                      <p className="text-xs text-muted-foreground truncate">{payment.property?.name}</p>
                    </div>
                    <div className="text-right ml-2">
                      <p className="font-semibold">{formatINR(payment.amount)}</p>
                      <div className="flex items-center gap-1 justify-end">
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(payment.due_date), "MMM d")}
                        </p>
                        <Badge
                          variant={paymentStatusConfig[payment.status]?.variant || "secondary"}
                          className="text-xs"
                        >
                          {payment.status}
                        </Badge>
                      </div>
                      {payment.status !== "paid" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 mt-1 px-2 text-xs"
                          onClick={() => setMarkPaidPayment(payment)}
                        >
                          <CheckCircle className="w-3 h-3 mr-1" />
                          {payment.status === "partial" ? "Record Another Payment" : "Record Payment"}
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Properties overview */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Properties</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/properties')}>
              View All
              <ArrowUpRight className="w-4 h-4 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 bg-secondary/30 rounded-lg" />
                  ))}
                </div>
              ) : properties.length === 0 ? (
                <p className="text-muted-foreground text-sm">No properties added yet. Add your first property to get started!</p>
              ) : (
                properties.slice(0, 4).map((property) => (
                  <div
                    key={property.id}
                    className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30 border border-white/5"
                  >
                    <div className="w-2 h-2 mt-2 rounded-full bg-primary flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{property.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{property.address}</p>
                    </div>
                    <Badge variant={occupancyStatusConfig[property.status] || "secondary"} className="flex-shrink-0">
                      {property.status}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      </>
      )}

      <AddPropertyDialog open={addPropertyOpen} onOpenChange={setAddPropertyOpen} />
      <AddTenantDialog open={addTenantOpen} onOpenChange={setAddTenantOpen} />
      <MarkPaidDialog
        open={!!markPaidPayment}
        onOpenChange={(open) => !open && setMarkPaidPayment(null)}
        payment={markPaidPayment}
      />
    </div>
  );
};

export default DashboardOverview;

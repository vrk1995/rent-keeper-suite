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
} from "lucide-react";
import { useProperties } from "@/hooks/useProperties";
import { useTenants } from "@/hooks/useTenants";
import { usePayments } from "@/hooks/usePayments";
import { formatINR } from "@/lib/currency";
import { format, differenceInDays, isToday, isTomorrow } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useMemo } from "react";

const DashboardOverview = () => {
  const navigate = useNavigate();
  const { data: properties = [], isLoading: propertiesLoading } = useProperties();
  const { data: tenants = [], isLoading: tenantsLoading } = useTenants();
  const { data: payments = [], isLoading: paymentsLoading } = usePayments();

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back! Here's your rental overview.</p>
        </div>
        <Button variant="hero" onClick={() => navigate('/dashboard/properties')}>
          <Plus className="w-4 h-4 mr-2" />
          Add Property
        </Button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
              <div className={`text-3xl font-display font-bold ${stat.highlight ? 'text-destructive' : ''}`}>
                {isLoading ? "..." : stat.value}
              </div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                {stat.trend === "up" && <TrendingUp className="w-3 h-3 text-success" />}
                {stat.trend === "warning" && <AlertTriangle className="w-3 h-3 text-destructive" />}
                {stat.change}
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
            <Button variant="outline" size="sm" onClick={() => navigate('/dashboard/payments')}>
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
                <p className="text-muted-foreground text-sm">Loading...</p>
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
                          variant={
                            payment.status === "paid" ? "glow" : 
                            payment.status === "overdue" ? "destructive" : "secondary"
                          }
                          className="text-xs"
                        >
                          {payment.status}
                        </Badge>
                      </div>
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
                <p className="text-muted-foreground text-sm">Loading...</p>
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
                    <Badge variant={property.status === "occupied" ? "glow" : "secondary"} className="flex-shrink-0">
                      {property.status}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DashboardOverview;

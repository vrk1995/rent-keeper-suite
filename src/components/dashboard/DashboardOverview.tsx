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
} from "lucide-react";
import { useProperties } from "@/hooks/useProperties";
import { useTenants } from "@/hooks/useTenants";
import { useUpcomingPayments } from "@/hooks/usePayments";
import { formatINR } from "@/lib/currency";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

const DashboardOverview = () => {
  const navigate = useNavigate();
  const { data: properties = [], isLoading: propertiesLoading } = useProperties();
  const { data: tenants = [], isLoading: tenantsLoading } = useTenants();
  const { data: upcomingPayments = [], isLoading: paymentsLoading } = useUpcomingPayments();

  const totalMonthlyRent = properties.reduce((sum, p) => sum + (p.monthly_rent || 0), 0);
  const pendingPayments = upcomingPayments.filter(p => p.status === 'pending' || p.status === 'overdue');
  const pendingAmount = pendingPayments.reduce((sum, p) => sum + p.amount, 0);

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
      change: tenants.length > 0 ? `${tenants.length} active` : "No tenants yet",
      icon: Users,
      trend: "up",
    },
    {
      title: "Monthly Rent Total",
      value: formatINR(totalMonthlyRent),
      change: "Across all properties",
      icon: DollarSign,
      trend: "up",
    },
    {
      title: "Pending Payments",
      value: pendingPayments.length.toString(),
      change: pendingAmount > 0 ? `${formatINR(pendingAmount)} outstanding` : "All clear",
      icon: AlertCircle,
      trend: pendingPayments.length > 0 ? "warning" : "up",
    },
  ];

  const isLoading = propertiesLoading || tenantsLoading || paymentsLoading;

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
          <Card key={stat.title} className="hover:border-primary/30 transition-all">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <stat.icon className="w-5 h-5 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-display font-bold">
                {isLoading ? "..." : stat.value}
              </div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                {stat.trend === "up" && <TrendingUp className="w-3 h-3 text-success" />}
                {stat.change}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming payments */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Upcoming Payments</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/payments')}>
              View All
              <ArrowUpRight className="w-4 h-4 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {isLoading ? (
                <p className="text-muted-foreground text-sm">Loading...</p>
              ) : upcomingPayments.length === 0 ? (
                <p className="text-muted-foreground text-sm">No upcoming payments</p>
              ) : (
                upcomingPayments.slice(0, 3).map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between p-4 rounded-xl bg-secondary/30 border border-white/5"
                  >
                    <div>
                      <p className="font-medium">{payment.property?.name || "Unknown Property"}</p>
                      <p className="text-sm text-muted-foreground">{payment.tenant?.name || "Unknown Tenant"}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-display font-semibold">{formatINR(payment.amount)}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(payment.due_date), "MMM d, yyyy")}
                        </p>
                        <Badge variant={payment.status === "overdue" ? "destructive" : "glow"}>
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
            <div className="space-y-4">
              {isLoading ? (
                <p className="text-muted-foreground text-sm">Loading...</p>
              ) : properties.length === 0 ? (
                <p className="text-muted-foreground text-sm">No properties added yet. Add your first property to get started!</p>
              ) : (
                properties.slice(0, 3).map((property) => (
                  <div
                    key={property.id}
                    className="flex items-start gap-4 p-4 rounded-xl bg-secondary/30 border border-white/5"
                  >
                    <div className="w-2 h-2 mt-2 rounded-full bg-primary" />
                    <div className="flex-1">
                      <p className="font-medium">{property.name}</p>
                      <p className="text-sm text-muted-foreground">{property.address}</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">
                        {formatINR(property.monthly_rent)}/month
                      </p>
                    </div>
                    <Badge variant={property.status === "occupied" ? "glow" : "secondary"}>
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

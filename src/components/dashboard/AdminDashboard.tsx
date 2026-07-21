import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  Users,
  IndianRupee,
  AlertCircle,
  TrendingUp,
  ArrowUpRight,
  Plus,
  UserPlus,
  Clock,
  CheckCircle,
  FileText,
  Percent,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { useProperties } from "@/hooks/useProperties";
import { useTenants } from "@/hooks/useTenants";
import { usePayments } from "@/hooks/usePayments";
import { useInvoices } from "@/hooks/useInvoices";
import { formatINR, formatINRCompact } from "@/lib/currency";
import { occupancyStatusConfig } from "@/lib/statusConfig";
import AddPropertyDialog from "@/components/properties/AddPropertyDialog";
import AddTenantDialog from "@/components/tenants/AddTenantDialog";

interface KPI {
  title: string;
  value: string;
  sub: string;
  icon: typeof Building2;
  onClick?: () => void;
  tone?: "default" | "danger" | "success" | "warn";
}

const toneClasses: Record<string, string> = {
  default: "border-white/5 hover:border-primary/40",
  danger: "border-destructive/40 bg-destructive/5 hover:border-destructive/60",
  success: "border-success/40 bg-success/5 hover:border-success/60",
  warn: "border-orange-500/40 bg-orange-500/5 hover:border-orange-500/60",
};

const iconTone: Record<string, string> = {
  default: "bg-primary/10 text-primary",
  danger: "bg-destructive/10 text-destructive",
  success: "bg-success/10 text-success",
  warn: "bg-orange-500/10 text-orange-500",
};

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { data: properties = [], isLoading: pl, isError: pe, refetch: rp } = useProperties();
  const { data: tenants = [], isLoading: tl, isError: te, refetch: rt } = useTenants();
  const { data: payments = [], isLoading: payL, isError: payE, refetch: rpay } = usePayments();
  const { data: invoices = [] } = useInvoices();
  const [addPropertyOpen, setAddPropertyOpen] = useState(false);
  const [addTenantOpen, setAddTenantOpen] = useState(false);

  const isLoading = pl || tl || payL;
  const isError = pe || te || payE;
  const refetchAll = () => { rp(); rt(); rpay(); };

  const stats = useMemo(() => {
    const activeTenants = tenants.filter((t) => t.status === "active");
    const monthlyExpected = activeTenants.reduce((s, t) => s + (t.monthly_rent || 0), 0);
    const overdue = payments.filter((p) => p.status === "overdue");
    const pending = payments.filter((p) => p.status === "pending");
    const overdueAmt = overdue.reduce((s, p) => s + (p.amount - (p.paid_amount || 0)), 0);
    // Collected money is tracked by paid_amount regardless of status label — a partial
    // payment whose due date has since passed becomes "overdue" for its remaining balance,
    // but the portion already received must still count towards what's been collected.
    const collectedAmt = payments.reduce(
      (s, p) => s + (p.paid_amount || (p.status === "paid" ? p.amount : 0)),
      0
    );
    const totalDue = payments.reduce((s, p) => s + p.amount, 0);
    const collectionRate = totalDue > 0 ? Math.round((collectedAmt / totalDue) * 100) : 0;

    const totalSqft = properties.reduce((s, p) => s + (p.total_sqft || 0), 0);
    const rentedSqft = activeTenants.reduce((s, t) => s + (t.rented_sqft || 0), 0);
    const occupancy = totalSqft > 0 ? Math.round((rentedSqft / totalSqft) * 100) : 0;

    const vacant = properties.filter((p) => p.status === "vacant").length;
    const partialProps = properties.filter((p) => p.status === "partial").length;

    return {
      monthlyExpected, overdue, overdueAmt, pending, collectedAmt, collectionRate,
      occupancy, rentedSqft, totalSqft, vacant, partialProps,
    };
  }, [properties, tenants, payments]);

  // Per-property performance
  const propertyPerf = useMemo(() => {
    return properties.map((prop) => {
      const propTenants = tenants.filter((t) => t.property_id === prop.id);
      const active = propTenants.filter((t) => t.status === "active");
      const rented = active.reduce((s, t) => s + (t.rented_sqft || 0), 0);
      const util = prop.total_sqft > 0 ? Math.round((rented / prop.total_sqft) * 100) : 0;
      const expected = active.reduce((s, t) => s + (t.monthly_rent || 0), 0);
      const propPayments = payments.filter((p) => p.property_id === prop.id);
      const overdue = propPayments.filter((p) => p.status === "overdue");
      const overdueAmt = overdue.reduce((s, p) => s + (p.amount - (p.paid_amount || 0)), 0);
      const collected = propPayments.reduce((s, p) => s + (p.paid_amount || 0), 0);
      return {
        id: prop.id,
        name: prop.name,
        status: prop.status,
        tenants: active.length,
        util,
        expected,
        collected,
        overdue: overdue.length,
        overdueAmt,
      };
    }).sort((a, b) => b.overdueAmt - a.overdueAmt || b.expected - a.expected);
  }, [properties, tenants, payments]);

  const kpis: KPI[] = [
    {
      title: "Properties",
      value: properties.length.toString(),
      sub: `${stats.vacant} vacant · ${stats.partialProps} partial`,
      icon: Building2,
      onClick: () => navigate("/dashboard/properties"),
    },
    {
      title: "Occupancy",
      value: `${stats.occupancy}%`,
      sub: `${formatINRCompact(stats.rentedSqft)} of ${formatINRCompact(stats.totalSqft)} sqft`,
      icon: Percent,
      onClick: () => navigate("/dashboard/properties"),
      tone: stats.occupancy >= 80 ? "success" : "default",
    },
    {
      title: "Monthly Expected",
      value: formatINRCompact(stats.monthlyExpected),
      sub: `${tenants.filter((t) => t.status === "active").length} active tenants`,
      icon: IndianRupee,
      onClick: () => navigate("/dashboard/tenants"),
    },
    {
      title: "Collection Rate",
      value: `${stats.collectionRate}%`,
      sub: `${formatINRCompact(stats.collectedAmt)} collected`,
      icon: TrendingUp,
      onClick: () => navigate("/dashboard/payments?status=paid"),
      tone: stats.collectionRate >= 80 ? "success" : "warn",
    },
    {
      title: "Overdue",
      value: stats.overdue.length.toString(),
      sub: stats.overdueAmt > 0 ? `${formatINR(stats.overdueAmt)} outstanding` : "All clear",
      icon: AlertCircle,
      onClick: () => navigate("/dashboard/payments?status=overdue"),
      tone: stats.overdue.length > 0 ? "danger" : "success",
    },
    {
      title: "Pending",
      value: stats.pending.length.toString(),
      sub: "Awaiting collection",
      icon: Clock,
      onClick: () => navigate("/dashboard/payments?status=pending"),
      tone: "warn",
    },
    {
      title: "Invoices",
      value: invoices.length.toString(),
      sub: `${invoices.filter((i) => i.status === "sent").length} sent`,
      icon: FileText,
      onClick: () => navigate("/dashboard/invoices"),
    },
    {
      title: "Tenants",
      value: tenants.length.toString(),
      sub: `${tenants.filter((t) => t.status === "active").length} active`,
      icon: Users,
      onClick: () => navigate("/dashboard/tenants"),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold">Owner Dashboard</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Click any tile or row to drill into the filtered view.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setAddTenantOpen(true)}>
            <UserPlus className="w-4 h-4 mr-2" /> Add Tenant
          </Button>
          <Button variant="hero" size="sm" onClick={() => setAddPropertyOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Add Property
          </Button>
        </div>
      </div>

      {isError ? (
        <ErrorState onRetry={refetchAll} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {kpis.map((k) => {
              const tone = k.tone || "default";
              return (
                <Card
                  key={k.title}
                  onClick={k.onClick}
                  className={`cursor-pointer transition-all ${toneClasses[tone]}`}
                >
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {k.title}
                    </CardTitle>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconTone[tone]}`}>
                      <k.icon className="w-5 h-5" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <Skeleton className="h-8 w-20 mb-1" />
                    ) : (
                      <div className="text-xl md:text-2xl font-display font-bold">{k.value}</div>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {isLoading ? <Skeleton className="h-3 w-24" /> : k.sub}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Building performance */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Building Performance</CardTitle>
                <p className="text-sm text-muted-foreground">Sorted by outstanding dues</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard/properties")}>
                View All <ArrowUpRight className="w-4 h-4 ml-1" />
              </Button>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 rounded-lg" />
                  ))}
                </div>
              ) : propertyPerf.length === 0 ? (
                <p className="text-sm text-muted-foreground">No properties yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground border-b border-white/5">
                      <tr>
                        <th className="text-left py-2 px-2">Property</th>
                        <th className="text-right py-2 px-2">Tenants</th>
                        <th className="text-right py-2 px-2">Utilization</th>
                        <th className="text-right py-2 px-2">Expected</th>
                        <th className="text-right py-2 px-2">Collected</th>
                        <th className="text-right py-2 px-2">Overdue</th>
                        <th className="py-2 px-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {propertyPerf.map((p) => (
                        <tr
                          key={p.id}
                          className="border-b border-white/5 hover:bg-secondary/30 cursor-pointer"
                          onClick={() => navigate(`/dashboard/payments?property=${p.id}`)}
                        >
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-primary" />
                              <span className="font-medium">{p.name}</span>
                              <Badge variant={occupancyStatusConfig[p.status] || "secondary"} className="text-xs">
                                {p.status}
                              </Badge>
                            </div>
                          </td>
                          <td className="text-right py-3 px-2">{p.tenants}</td>
                          <td className="text-right py-3 px-2">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-1.5 rounded-full bg-secondary overflow-hidden">
                                <div
                                  className={`h-full ${p.util >= 80 ? "bg-success" : p.util >= 40 ? "bg-orange-500" : "bg-destructive"}`}
                                  style={{ width: `${Math.min(p.util, 100)}%` }}
                                />
                              </div>
                              <span className="tabular-nums w-10 text-right">{p.util}%</span>
                            </div>
                          </td>
                          <td className="text-right py-3 px-2 tabular-nums">{formatINRCompact(p.expected)}</td>
                          <td className="text-right py-3 px-2 tabular-nums text-success">{formatINRCompact(p.collected)}</td>
                          <td className="text-right py-3 px-2">
                            {p.overdue > 0 ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/dashboard/payments?status=overdue&property=${p.id}`);
                                }}
                                className="text-destructive hover:underline tabular-nums"
                              >
                                {p.overdue} · {formatINRCompact(p.overdueAmt)}
                              </button>
                            ) : (
                              <span className="text-muted-foreground inline-flex items-center gap-1"><CheckCircle className="w-3 h-3 text-success" /> Clear</span>
                            )}
                          </td>
                          <td className="text-right py-3 px-2 text-muted-foreground">
                            <ArrowUpRight className="w-4 h-4 inline" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <AddPropertyDialog open={addPropertyOpen} onOpenChange={setAddPropertyOpen} />
      <AddTenantDialog open={addTenantOpen} onOpenChange={setAddTenantOpen} />
    </div>
  );
};

export default AdminDashboard;

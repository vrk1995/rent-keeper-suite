import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, differenceInDays, isToday, isTomorrow } from "date-fns";
import {
  AlertCircle,
  Clock,
  CheckCircle,
  Building2,
  FileText,
  ArrowUpRight,
  IndianRupee,
  Home,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { useProperties } from "@/hooks/useProperties";
import { useTenants } from "@/hooks/useTenants";
import { usePayments, RentPayment } from "@/hooks/usePayments";
import { useInvoices } from "@/hooks/useInvoices";
import { formatINR, formatINRCompact } from "@/lib/currency";
import { occupancyStatusConfig } from "@/lib/statusConfig";
import { MarkPaidDialog } from "@/components/payments/MarkPaidDialog";

const getDueDateLabel = (dueDate: string) => {
  const date = new Date(dueDate);
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  const days = differenceInDays(date, new Date());
  if (days < 0) return `${Math.abs(days)}d overdue`;
  return `In ${days}d`;
};

const MemberDashboard = () => {
  const navigate = useNavigate();
  const { data: properties = [], isLoading: pl, isError: pe, refetch: rp } = useProperties();
  const { data: tenants = [], isLoading: tl, isError: te, refetch: rt } = useTenants();
  const { data: payments = [], isLoading: payL, isError: payE, refetch: rpay } = usePayments();
  const { data: invoices = [] } = useInvoices();
  const [markPaid, setMarkPaid] = useState<RentPayment | null>(null);

  const isLoading = pl || tl || payL;
  const isError = pe || te || payE;
  const refetchAll = () => { rp(); rt(); rpay(); };

  const data = useMemo(() => {
    const now = new Date();
    const overdue = payments
      .filter((p) => p.status === "overdue")
      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
    const pending = payments.filter((p) => p.status === "pending");
    const upcoming = pending
      .filter((p) => {
        const d = differenceInDays(new Date(p.due_date), now);
        return d >= 0 && d <= 7;
      })
      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
    const dueThisWeek = payments.filter((p) => {
      const d = differenceInDays(new Date(p.due_date), now);
      return (p.status === "pending" || p.status === "overdue") && d >= -30 && d <= 7;
    });
    const overdueAmt = overdue.reduce((s, p) => s + (p.amount - (p.paid_amount || 0)), 0);
    const upcomingAmt = upcoming.reduce((s, p) => s + p.amount, 0);
    const vacantProps = properties.filter((p) => p.status === "vacant");
    const openInvoices = invoices.filter((i) => i.status === "sent" || i.status === "overdue");
    return { overdue, upcoming, dueThisWeek, overdueAmt, upcomingAmt, vacantProps, openInvoices };
  }, [payments, properties, invoices]);

  const kpis = [
    {
      title: "Overdue",
      value: data.overdue.length.toString(),
      sub: data.overdueAmt > 0 ? formatINR(data.overdueAmt) : "All clear",
      icon: AlertCircle,
      tone: data.overdue.length > 0 ? "danger" : "success",
      onClick: () => navigate("/dashboard/payments?status=overdue"),
    },
    {
      title: "Due This Week",
      value: data.upcoming.length.toString(),
      sub: formatINRCompact(data.upcomingAmt),
      icon: Clock,
      tone: "warn",
      onClick: () => navigate("/dashboard/payments?status=pending"),
    },
    {
      title: "Open Invoices",
      value: data.openInvoices.length.toString(),
      sub: "To send/collect",
      icon: FileText,
      tone: "default",
      onClick: () => navigate("/dashboard/invoices?status=sent"),
    },
    {
      title: "Vacant Units",
      value: data.vacantProps.length.toString(),
      sub: "Available to fill",
      icon: Home,
      tone: data.vacantProps.length > 0 ? "warn" : "success",
      onClick: () => navigate("/dashboard/properties?status=vacant"),
    },
  ];

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-display font-bold">My Tasks</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Payments to chase, invoices to send, units to fill.
        </p>
      </div>

      {isError ? (
        <ErrorState onRetry={refetchAll} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {kpis.map((k) => (
              <Card
                key={k.title}
                onClick={k.onClick}
                className={`cursor-pointer transition-all ${toneClasses[k.tone]}`}
              >
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{k.title}</CardTitle>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconTone[k.tone]}`}>
                    <k.icon className="w-5 h-5" />
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-8 w-16 mb-1" />
                  ) : (
                    <div className="text-xl md:text-2xl font-display font-bold">{k.value}</div>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {isLoading ? <Skeleton className="h-3 w-20" /> : k.sub}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Overdue list */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-destructive/10">
                    <AlertCircle className="w-4 h-4 text-destructive" />
                  </div>
                  <CardTitle>Overdue Payments</CardTitle>
                </div>
                <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard/payments?status=overdue")}>
                  View All <ArrowUpRight className="w-4 h-4 ml-1" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)
                ) : data.overdue.length === 0 ? (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-success" /> No overdue payments. Great work!
                  </p>
                ) : (
                  data.overdue.slice(0, 6).map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-destructive/5 border border-destructive/20 hover:bg-destructive/10 cursor-pointer"
                      onClick={() => navigate(`/dashboard/payments?tenant=${p.tenant_id}`)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{p.tenant?.name || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground truncate">{p.property?.name}</p>
                      </div>
                      <div className="text-right ml-2 flex flex-col items-end gap-1">
                        <p className="font-semibold text-destructive tabular-nums">{formatINR(p.amount)}</p>
                        <Badge variant="destructive" className="text-xs">{getDueDateLabel(p.due_date)}</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={(e) => { e.stopPropagation(); setMarkPaid(p); }}
                        >
                          <IndianRupee className="w-3 h-3 mr-1" /> Record
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Upcoming */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-orange-500/10">
                    <Clock className="w-4 h-4 text-orange-500" />
                  </div>
                  <CardTitle>Due This Week</CardTitle>
                </div>
                <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard/payments?status=pending")}>
                  View All <ArrowUpRight className="w-4 h-4 ml-1" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)
                ) : data.upcoming.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing coming due in the next 7 days.</p>
                ) : (
                  data.upcoming.slice(0, 6).map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-orange-500/5 border border-orange-500/20 hover:bg-orange-500/10 cursor-pointer"
                      onClick={() => navigate(`/dashboard/payments?tenant=${p.tenant_id}`)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{p.tenant?.name || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {p.property?.name} · Due {format(new Date(p.due_date), "MMM d")}
                        </p>
                      </div>
                      <div className="text-right ml-2">
                        <p className="font-semibold tabular-nums">{formatINR(p.amount)}</p>
                        <Badge variant="secondary" className="text-xs bg-orange-500/20 text-orange-600 dark:text-orange-400">
                          {getDueDateLabel(p.due_date)}
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Vacant properties */}
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Building2 className="w-4 h-4 text-primary" />
                  </div>
                  <CardTitle>Vacant & Partially Filled</CardTitle>
                </div>
                <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard/properties?status=vacant")}>
                  View All <ArrowUpRight className="w-4 h-4 ml-1" />
                </Button>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-16 rounded-lg" />
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {properties
                      .filter((p) => p.status === "vacant" || p.status === "partial")
                      .slice(0, 6)
                      .map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-white/5 hover:border-primary/30 cursor-pointer"
                          onClick={() => navigate(`/dashboard/properties?status=${p.status}`)}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{p.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{p.address}</p>
                          </div>
                          <Badge variant={occupancyStatusConfig[p.status] || "secondary"}>
                            {p.status}
                          </Badge>
                        </div>
                      ))}
                    {properties.filter((p) => p.status === "vacant" || p.status === "partial").length === 0 && (
                      <p className="text-sm text-muted-foreground">All properties fully occupied 🎉</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <MarkPaidDialog
        open={!!markPaid}
        onOpenChange={(o) => !o && setMarkPaid(null)}
        payment={markPaid}
      />
    </div>
  );
};

export default MemberDashboard;

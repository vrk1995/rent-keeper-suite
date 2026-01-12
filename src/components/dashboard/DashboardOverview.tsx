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
} from "lucide-react";

const stats = [
  {
    title: "Total Properties",
    value: "12",
    change: "+2 this month",
    icon: Building2,
    trend: "up",
  },
  {
    title: "Monthly Revenue",
    value: "$24,500",
    change: "+8.2% from last month",
    icon: DollarSign,
    trend: "up",
  },
  {
    title: "Pending Payments",
    value: "3",
    change: "$4,200 outstanding",
    icon: AlertCircle,
    trend: "neutral",
  },
  {
    title: "Renewals Due",
    value: "2",
    change: "Within 30 days",
    icon: Calendar,
    trend: "warning",
  },
];

const upcomingPayments = [
  { property: "Sunset Apartments #101", tenant: "John Smith", amount: 1500, dueDate: "Jan 15, 2026", status: "upcoming" },
  { property: "Oak Street House", tenant: "Sarah Johnson", amount: 2200, dueDate: "Jan 18, 2026", status: "upcoming" },
  { property: "Downtown Loft #3B", tenant: "Mike Chen", amount: 1800, dueDate: "Jan 20, 2026", status: "overdue" },
];

const recentActivity = [
  { action: "Payment received", detail: "Sunset Apartments #102 - $1,500", time: "2 hours ago" },
  { action: "Document uploaded", detail: "Lease agreement for Oak Street", time: "5 hours ago" },
  { action: "Reminder sent", detail: "Rent due notification to 5 tenants", time: "1 day ago" },
];

const DashboardOverview = () => {
  return (
    <div className="space-y-6">
      {/* Welcome message */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back! Here's your rental overview.</p>
        </div>
        <Button variant="hero">
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
              <div className="text-3xl font-display font-bold">{stat.value}</div>
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
            <Button variant="ghost" size="sm">
              View All
              <ArrowUpRight className="w-4 h-4 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {upcomingPayments.map((payment, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 rounded-xl bg-secondary/30 border border-white/5"
                >
                  <div>
                    <p className="font-medium">{payment.property}</p>
                    <p className="text-sm text-muted-foreground">{payment.tenant}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-display font-semibold">${payment.amount.toLocaleString()}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground">{payment.dueDate}</p>
                      <Badge variant={payment.status === "overdue" ? "destructive" : "glow"}>
                        {payment.status}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Activity</CardTitle>
            <Button variant="ghost" size="sm">
              View All
              <ArrowUpRight className="w-4 h-4 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.map((activity, index) => (
                <div
                  key={index}
                  className="flex items-start gap-4 p-4 rounded-xl bg-secondary/30 border border-white/5"
                >
                  <div className="w-2 h-2 mt-2 rounded-full bg-primary" />
                  <div className="flex-1">
                    <p className="font-medium">{activity.action}</p>
                    <p className="text-sm text-muted-foreground">{activity.detail}</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DashboardOverview;

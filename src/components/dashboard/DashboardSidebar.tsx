import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Building2,
  LayoutDashboard,
  Home,
  Calendar,
  FileText,
  FolderOpen,
  Users,
  UserCog,
  Bell,
  Receipt,
  CreditCard,
  ShieldCheck,
  Percent,
  Plug,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsSuperAdmin } from "@/hooks/useUserRole";

const navItems = [
  { icon: LayoutDashboard, label: "Overview", href: "/dashboard", tour: "overview" },
  { icon: Home, label: "Properties", href: "/dashboard/properties", tour: "properties" },
  { icon: Users, label: "Tenants", href: "/dashboard/tenants", tour: "tenants" },
  { icon: Calendar, label: "Receipts", href: "/dashboard/payments", tour: "receipts" },
  { icon: CreditCard, label: "Payments", href: "/dashboard/payments-log", tour: "payments" },
  { icon: FileText, label: "Invoices", href: "/dashboard/invoices", tour: "invoices" },
  { icon: FolderOpen, label: "Documents", href: "/dashboard/documents", tour: "documents" },
  { icon: Bell, label: "Reminders", href: "/dashboard/reminders", tour: "reminders" },
  { icon: UserCog, label: "Team", href: "/dashboard/team", tour: "team" },
  { icon: Receipt, label: "Billing", href: "/dashboard/billing-addresses", tour: "billing" },
  { icon: Percent, label: "GST/TDS", href: "/dashboard/gst-tds", tour: "gst-tds" },
  { icon: Plug, label: "Integrations", href: "/dashboard/integrations", tour: "integrations" },
];

const DashboardSidebar = () => {
  const location = useLocation();
  const { isSuperAdmin } = useIsSuperAdmin();

  return (
    <motion.aside
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
      className="hidden md:flex w-64 border-r border-white/10 bg-card/40 backdrop-blur-xl flex-col"
    >
      {/* Logo */}
      <div className="p-6 border-b border-white/10">
        <Link to="/dashboard" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <span className="text-xl font-display font-bold">RentFlow</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  to={item.href}
                  data-tour={`nav-${item.tour}`}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </Link>
              </li>
            );
          })}
          
          {/* Super Admin-only link */}
          {isSuperAdmin && (
            <li>
              <Link
                to="/dashboard/admin"
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
                  location.pathname === "/dashboard/admin"
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                )}
              >
                <ShieldCheck className="w-5 h-5" />
                Super Admin
              </Link>
            </li>
          )}
        </ul>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-white/10">
        <div className="glass rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground mb-2">Need help?</p>
          <p className="text-sm font-medium text-muted-foreground">Contact Support</p>
        </div>
      </div>
    </motion.aside>
  );
};

export default DashboardSidebar;

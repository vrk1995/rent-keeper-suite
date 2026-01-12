import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Building2,
  LayoutDashboard,
  Home,
  Calendar,
  FileText,
  Users,
  Settings,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { icon: LayoutDashboard, label: "Overview", href: "/dashboard" },
  { icon: Home, label: "Properties", href: "/dashboard/properties" },
  { icon: Building2, label: "Buildings", href: "/dashboard/buildings" },
  { icon: Users, label: "Tenants", href: "/dashboard/tenants" },
  { icon: Calendar, label: "Payments", href: "/dashboard/payments" },
  { icon: FileText, label: "Invoices", href: "/dashboard/invoices" },
  { icon: FileText, label: "Documents", href: "/dashboard/documents" },
  { icon: Bell, label: "Reminders", href: "/dashboard/reminders" },
];

const DashboardSidebar = () => {
  const location = useLocation();

  return (
    <motion.aside
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
      className="w-64 border-r border-white/10 bg-card/40 backdrop-blur-xl flex flex-col"
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
        </ul>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-white/10">
        <div className="glass rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground mb-2">Need help?</p>
          <p className="text-sm font-medium text-primary">Contact Support</p>
        </div>
      </div>
    </motion.aside>
  );
};

export default DashboardSidebar;

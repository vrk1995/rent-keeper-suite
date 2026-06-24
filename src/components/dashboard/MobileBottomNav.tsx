import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import {
  LayoutDashboard,
  Home,
  Users,
  Calendar,
  MoreHorizontal,
  FileText,
  Bell,
  Receipt,
  ShieldCheck,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsSuperAdmin } from "@/hooks/useUserRole";
import { motion, AnimatePresence } from "framer-motion";

const primaryNavItems = [
  { icon: LayoutDashboard, label: "Home", href: "/dashboard" },
  { icon: Home, label: "Properties", href: "/dashboard/properties" },
  { icon: Users, label: "Tenants", href: "/dashboard/tenants" },
  { icon: Calendar, label: "Receipts", href: "/dashboard/payments" },
];

const moreNavItems = [
  { icon: CreditCard, label: "Payments", href: "/dashboard/payments-log" },
  { icon: FileText, label: "Invoices", href: "/dashboard/invoices" },
  { icon: FileText, label: "Documents", href: "/dashboard/documents" },
  { icon: Bell, label: "Reminders", href: "/dashboard/reminders" },
  { icon: Users, label: "Team", href: "/dashboard/team" },
  { icon: Receipt, label: "Billing", href: "/dashboard/billing-addresses" },
];

const MobileBottomNav = () => {
  const location = useLocation();
  const { isSuperAdmin } = useIsSuperAdmin();
  const [moreOpen, setMoreOpen] = useState(false);

  const isMoreActive = moreNavItems.some(item => location.pathname === item.href) ||
    (isSuperAdmin && location.pathname === "/dashboard/admin");

  return (
    <>
      {/* More menu overlay */}
      <AnimatePresence>
        {moreOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setMoreOpen(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="absolute bottom-16 left-0 right-0 bg-card border-t border-white/10 rounded-t-2xl p-4 pb-2"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-sm font-medium text-muted-foreground">More</span>
                <button onClick={() => setMoreOpen(false)} className="p-1">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {moreNavItems.map((item) => {
                  const isActive = location.pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      onClick={() => setMoreOpen(false)}
                      className={cn(
                        "flex flex-col items-center gap-1.5 p-3 rounded-xl text-xs transition-all",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-white/5"
                      )}
                    >
                      <item.icon className="w-5 h-5" />
                      {item.label}
                    </Link>
                  );
                })}
                {isSuperAdmin && (
                  <Link
                    to="/dashboard/admin"
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 p-3 rounded-xl text-xs transition-all",
                      location.pathname === "/dashboard/admin"
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-white/5"
                    )}
                  >
                    <ShieldCheck className="w-5 h-5" />
                    Admin
                  </Link>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom nav bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-white/10 safe-area-bottom md:hidden">
        <div className="flex items-center justify-around h-16">
          {primaryNavItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all min-w-[60px]",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground"
                )}
              >
                <item.icon className={cn("w-5 h-5", isActive && "drop-shadow-[0_0_6px_hsl(var(--primary)/0.5)]")} />
                {item.label}
              </Link>
            );
          })}
          <button
            onClick={() => setMoreOpen(!moreOpen)}
            className={cn(
              "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all min-w-[60px]",
              isMoreActive ? "text-primary" : "text-muted-foreground"
            )}
          >
            <MoreHorizontal className={cn("w-5 h-5", isMoreActive && "drop-shadow-[0_0_6px_hsl(var(--primary)/0.5)]")} />
            More
          </button>
        </div>
      </nav>
    </>
  );
};

export default MobileBottomNav;

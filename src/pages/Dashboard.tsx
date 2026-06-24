import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import MobileBottomNav from "@/components/dashboard/MobileBottomNav";
import DashboardOverview from "@/components/dashboard/DashboardOverview";
import Properties from "@/pages/Properties";
import Tenants from "@/pages/Tenants";
import Payments from "@/pages/Payments";
import PaymentsLog from "@/pages/PaymentsLog";
import Invoices from "@/pages/Invoices";
import Documents from "@/pages/Documents";
import Reminders from "@/pages/Reminders";
import Team from "@/pages/Team";
import BillingAddresses from "@/pages/BillingAddresses";
import AdminApprovals from "@/pages/AdminApprovals";
import PendingApproval from "@/pages/PendingApproval";
import { OwnerFilterProvider } from "@/contexts/OwnerFilterContext";
import { FinancialYearProvider } from "@/contexts/FinancialYearContext";
import { useApprovalStatus } from "@/hooks/useApprovalStatus";
import { useIsAdmin, useIsSuperAdmin } from "@/hooks/useUserRole";

const Dashboard = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const { data: isApproved, isLoading: approvalLoading } = useApprovalStatus();
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();
  const { isSuperAdmin, isLoading: superAdminLoading } = useIsSuperAdmin();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        if (!session) navigate("/auth");
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      if (!session) navigate("/auth");
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  if (loading || approvalLoading || adminLoading || superAdminLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  if (!isApproved && !isAdmin && !isSuperAdmin) {
    return <PendingApproval />;
  }

  const renderContent = () => {
    const path = location.pathname;
    if (path === "/dashboard/properties") return <Properties />;
    if (path === "/dashboard/tenants") return <Tenants />;
    if (path === "/dashboard/payments") return <Payments />;
    if (path === "/dashboard/invoices") return <Invoices />;
    if (path === "/dashboard/documents") return <Documents />;
    if (path === "/dashboard/reminders") return <Reminders />;
    if (path === "/dashboard/team") return <Team />;
    if (path === "/dashboard/billing-addresses") return <BillingAddresses />;
    if (path === "/dashboard/admin" && isSuperAdmin) return <AdminApprovals />;
    return <DashboardOverview />;
  };

  return (
    <OwnerFilterProvider>
      <FinancialYearProvider>
        <div className="min-h-screen bg-background flex overflow-x-hidden">
          <DashboardSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <DashboardHeader user={user} />
            <main className="flex-1 p-3 md:p-6 overflow-auto pb-20 md:pb-6">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                {renderContent()}
              </motion.div>
            </main>
          </div>
          <MobileBottomNav />
        </div>
      </FinancialYearProvider>
    </OwnerFilterProvider>
  );
};

export default Dashboard;

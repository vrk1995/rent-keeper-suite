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
import GstTdsReports from "@/pages/GstTdsReports";
import Integrations from "@/pages/Integrations";
import AdminApprovals from "@/pages/AdminApprovals";
import { OwnerFilterProvider } from "@/contexts/OwnerFilterContext";
import { FinancialYearProvider } from "@/contexts/FinancialYearContext";
import { useIsSuperAdmin } from "@/hooks/useUserRole";
import ProductTour from "@/components/onboarding/ProductTour";
import HelpChat from "@/components/onboarding/HelpChat";
import { useCrossTabAuthSync } from "@/hooks/useCrossTabAuthSync";

const Dashboard = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [forceTour, setForceTour] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { isSuperAdmin, isLoading: superAdminLoading } = useIsSuperAdmin();

  useCrossTabAuthSync();

  useEffect(() => {
    let active = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!active) return;
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        // Only bounce to /auth on an explicit sign-out. A transient null
        // session (e.g. token refresh in another tab) must not log the user out.
        if (!session && event === "SIGNED_OUT") navigate("/auth");
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      let current = session;
      if (!current) {
        // Give the client a moment to hydrate/refresh from localStorage
        // (another tab may have just rotated the token).
        await new Promise((r) => setTimeout(r, 400));
        const { data } = await supabase.auth.getSession();
        current = data.session;
      }
      if (!active) return;
      setSession(current);
      setUser(current?.user ?? null);
      setLoading(false);
      if (!current) navigate("/auth");
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [navigate]);


  if (loading || superAdminLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  const renderContent = () => {
    const path = location.pathname;
    if (path === "/dashboard/properties") return <Properties />;
    if (path === "/dashboard/tenants") return <Tenants />;
    if (path === "/dashboard/payments") return <Payments />;
    if (path === "/dashboard/payments-log") return <PaymentsLog />;
    if (path === "/dashboard/invoices") return <Invoices />;
    if (path === "/dashboard/documents") return <Documents />;
    if (path === "/dashboard/reminders") return <Reminders />;
    if (path === "/dashboard/team") return <Team />;
    if (path === "/dashboard/billing-addresses") return <BillingAddresses />;
    if (path === "/dashboard/gst-tds") return <GstTdsReports />;
    if (path === "/dashboard/integrations") return <Integrations />;
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
          <ProductTour forceStart={forceTour} onFinish={() => setForceTour(false)} />
          <HelpChat onRestartTour={() => setForceTour(true)} />
        </div>
      </FinancialYearProvider>
    </OwnerFilterProvider>
  );
};

export default Dashboard;

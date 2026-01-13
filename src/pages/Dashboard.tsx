import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import DashboardOverview from "@/components/dashboard/DashboardOverview";
import Properties from "@/pages/Properties";
import Tenants from "@/pages/Tenants";
import Payments from "@/pages/Payments";
import Invoices from "@/pages/Invoices";
import Documents from "@/pages/Documents";
import Reminders from "@/pages/Reminders";
import Team from "@/pages/Team";
import BillingAddresses from "@/pages/BillingAddresses";

const Dashboard = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        
        if (!session) {
          navigate("/auth");
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      
      if (!session) {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // Determine which page to render based on the current path
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
    
    return <DashboardOverview />;
  };

  return (
    <div className="min-h-screen bg-background flex">
      <DashboardSidebar />
      <div className="flex-1 flex flex-col">
        <DashboardHeader user={user} />
        <main className="flex-1 p-6 overflow-auto">
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
    </div>
  );
};

export default Dashboard;

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/landing/Navbar";
import HeroSection from "@/components/landing/HeroSection";
import FeaturesSection from "@/components/landing/FeaturesSection";
import CTASection from "@/components/landing/CTASection";
import Footer from "@/components/landing/Footer";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Handle invite / recovery links. Supabase appends auth tokens to the URL
    // (either as a hash like #access_token=...&type=invite or as ?code=...).
    // With HashRouter the route resolves to "/" so we intercept here.
    const url = new URL(window.location.href);
    const rawHash = window.location.hash || "";
    const isAuthHash = rawHash.includes("access_token") || rawHash.includes("type=invite") || rawHash.includes("type=recovery");
    const hasCode = url.searchParams.has("code");

    if (!isAuthHash && !hasCode) return;

    const inviteOrRecovery = rawHash.includes("type=invite") || rawHash.includes("type=recovery") || url.searchParams.get("type") === "invite" || url.searchParams.get("type") === "recovery";

    const sub = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "PASSWORD_RECOVERY") && session) {
        if (inviteOrRecovery || event === "PASSWORD_RECOVERY") {
          navigate("/set-password", { replace: true });
        } else {
          navigate("/dashboard", { replace: true });
        }
      }
    });

    // Also check immediately in case session was already established.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session && inviteOrRecovery) {
        navigate("/set-password", { replace: true });
      }
    });

    return () => sub.data.subscription.unsubscribe();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <Navbar />
      <main>
        <HeroSection />
        <FeaturesSection />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
};

export default Index;

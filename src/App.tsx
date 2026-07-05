import { useEffect, useState } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import { Building2 } from "lucide-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import SetPassword from "./pages/SetPassword";
import NotFound from "./pages/NotFound";
import { supabase } from "@/integrations/supabase/client";
import { getCanonicalCallbackUrl, getCanonicalHashRouteUrl, isCanonicalAppHost } from "@/lib/authRedirect";

const queryClient = new QueryClient();

const hasAuthCallback = () => {
  const url = new URL(window.location.href);
  const rawHash = window.location.hash || "";
  const canonicalHref = window.location.href.replace(window.location.origin, "https://terntripsindia.in");

  return (
    rawHash.includes("access_token") ||
    rawHash.includes("refresh_token") ||
    rawHash.includes("type=invite") ||
    rawHash.includes("type=recovery") ||
    url.searchParams.has("code")
  );
};

const isPasswordSetupCallback = () => {
  const href = window.location.href;
  return href.includes("type=invite") || href.includes("type=recovery");
};

const AuthLinkGate = () => {
  const [message, setMessage] = useState("Verifying your secure link…");
  const canonicalHref = window.location.href.replace(window.location.origin, "https://terntripsindia.in");

  useEffect(() => {
    let redirected = false;
    const target = isPasswordSetupCallback() ? "/invite-signup" : "/dashboard";
    const redirect = () => {
      if (redirected) return;
      redirected = true;
      window.location.replace(getCanonicalHashRouteUrl(target));
    };

    const subscription = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) redirect();
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        redirect();
        return;
      }

      window.setTimeout(async () => {
        const { data: retry } = await supabase.auth.getSession();
        if (retry.session) {
          redirect();
        } else {
          setMessage("This link has expired. Please request a new one.");
          window.setTimeout(() => {
            if (!redirected) {
              window.location.replace(getCanonicalHashRouteUrl("/auth"));
            }
          }, 1200);
        }
      }, 1200);
    });

    return () => subscription.data.subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="glass-strong rounded-3xl p-8 text-center max-w-sm w-full">
        <div className="mx-auto mb-4 w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
          <Building2 className="w-6 h-6 text-primary" />
        </div>
        <h1 className="text-xl font-display font-bold mb-2">RentKeeper</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        {!isCanonicalAppHost() && (
          <a className="mt-4 inline-flex text-sm text-primary underline" href={canonicalHref}>
            Continue on terntripsindia.in
          </a>
        )}
      </div>
    </div>
  );
};

const AppRoutes = () => {
  if (hasAuthCallback()) {
    if (!isCanonicalAppHost()) {
      window.location.replace(getCanonicalCallbackUrl());
      return <AuthLinkGate />;
    }
    return <AuthLinkGate />;
  }

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/invite-signup" element={<SetPassword />} />
        <Route path="/set-password" element={<SetPassword />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/dashboard/*" element={<Dashboard />} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </HashRouter>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <ErrorBoundary>
        <AppRoutes />
      </ErrorBoundary>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

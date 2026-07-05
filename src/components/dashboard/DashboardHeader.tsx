import { User } from "@supabase/supabase-js";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogOut, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import OwnerFilterSelect from "@/components/filters/OwnerFilterSelect";
import FinancialYearSelect from "@/components/filters/FinancialYearSelect";
import { Link } from "react-router-dom";

interface DashboardHeaderProps {
  user: User;
}

const DashboardHeader = ({ user }: DashboardHeaderProps) => {
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out successfully.");
    navigate("/");
  };

  return (
    <header className="border-b border-white/10 bg-card/40 backdrop-blur-xl px-3 md:px-6 flex items-center justify-between safe-area-top" style={{ minHeight: '3.5rem', paddingTop: `max(0.5rem, env(safe-area-inset-top, 0px))` }}>
      {/* Mobile logo */}
      <Link to="/dashboard" className="flex md:hidden items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
          <Building2 className="w-4 h-4 text-primary" />
        </div>
        <span className="text-lg font-display font-bold">RentFlow</span>
      </Link>

      {/* Filter - hidden on mobile */}
      <div className="hidden md:flex items-center gap-4">
        <OwnerFilterSelect />
        <FinancialYearSelect />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 md:gap-4">
        {/* Filters on mobile - compact */}
        <div className="md:hidden flex items-center gap-1">
          <OwnerFilterSelect />
          <FinancialYearSelect />
        </div>

        {/* User info - hidden on mobile */}
        <div className="hidden md:flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium">
              {user.user_metadata?.full_name || user.email?.split("@")[0]}
            </p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
            <span className="text-sm font-semibold text-primary">
              {(user.user_metadata?.full_name || user.email || "U")[0].toUpperCase()}
            </span>
          </div>
        </div>

        {/* Mobile avatar */}
        <div className="flex md:hidden w-8 h-8 rounded-full bg-primary/20 items-center justify-center">
          <span className="text-xs font-semibold text-primary">
            {(user.user_metadata?.full_name || user.email || "U")[0].toUpperCase()}
          </span>
        </div>

        <Button variant="ghost" size="icon" onClick={handleSignOut} aria-label="Sign out" className="h-8 w-8 md:h-10 md:w-10">
          <LogOut className="w-4 h-4 md:w-5 md:h-5" />
        </Button>
      </div>
    </header>
  );
};

export default DashboardHeader;

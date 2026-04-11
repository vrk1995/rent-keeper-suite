import { User } from "@supabase/supabase-js";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Bell, LogOut, Search, Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import OwnerFilterSelect from "@/components/filters/OwnerFilterSelect";
import { Link } from "react-router-dom";

interface DashboardHeaderProps {
  user: User;
}

const DashboardHeader = ({ user }: DashboardHeaderProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Signed out",
      description: "You have been signed out successfully.",
    });
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

      {/* Search and Filter - hidden on mobile */}
      <div className="hidden md:flex items-center gap-4">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search properties, tenants..."
            className="pl-10 bg-secondary/50 border-white/10"
          />
        </div>
        <OwnerFilterSelect />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 md:gap-4">
        {/* Owner filter on mobile - compact */}
        <div className="md:hidden">
          <OwnerFilterSelect />
        </div>

        <Button variant="ghost" size="icon" className="relative h-8 w-8 md:h-10 md:w-10">
          <Bell className="w-4 h-4 md:w-5 md:h-5" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full" />
        </Button>

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

        <Button variant="ghost" size="icon" onClick={handleSignOut} className="h-8 w-8 md:h-10 md:w-10">
          <LogOut className="w-4 h-4 md:w-5 md:h-5" />
        </Button>
      </div>
    </header>
  );
};

export default DashboardHeader;

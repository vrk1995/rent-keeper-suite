import { useUserRole } from "@/hooks/useUserRole";
import AdminDashboard from "./AdminDashboard";
import MemberDashboard from "./MemberDashboard";
import { Skeleton } from "@/components/ui/skeleton";

const DashboardOverview = () => {
  const { data: role, isLoading } = useUserRole();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const isAdmin = role === "admin" || role === "super_admin";
  return isAdmin ? <AdminDashboard /> : <MemberDashboard />;
};

export default DashboardOverview;


import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = 'super_admin' | 'admin' | 'member' | 'viewer';

export const useUserRole = () => {
  return useQuery({
    queryKey: ["user-role"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();

      if (error) {
        // If no role found, return 'member' as default
        if (error.code === 'PGRST116') {
          return 'member' as AppRole;
        }
        throw error;
      }

      return (data?.role || 'member') as AppRole;
    },
  });
};

export const useIsAdmin = () => {
  const { data: role, isLoading } = useUserRole();
  return { isAdmin: role === 'admin' || role === 'super_admin', isLoading };
};

export const useIsSuperAdmin = () => {
  const { data: role, isLoading } = useUserRole();
  return { isSuperAdmin: role === 'super_admin', isLoading };
};

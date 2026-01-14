import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useApprovalStatus = () => {
  return useQuery({
    queryKey: ["approval-status"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { isApproved: false, isLoading: false };

      const { data, error } = await supabase
        .from("profiles")
        .select("is_approved")
        .eq("user_id", user.id)
        .single();

      if (error) {
        // If no profile found, user is not approved
        if (error.code === 'PGRST116') {
          return false;
        }
        throw error;
      }

      return data?.is_approved ?? false;
    },
  });
};

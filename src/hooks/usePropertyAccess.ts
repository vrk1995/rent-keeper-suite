import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface PropertyAccessRow {
  id: string;
  user_id: string;
  property_id: string;
  created_at: string;
}

/** Every property-access grant in the workspace, for showing each member's scope on the
 *  Team page. A user with no rows is unrestricted (sees all properties). */
export const useAllPropertyAccess = () => {
  return useQuery({
    queryKey: ["property-access"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_property_access")
        .select("id, user_id, property_id, created_at");
      if (error) throw error;
      return data as PropertyAccessRow[];
    },
  });
};

/** Replace a user's property scope. Empty array = unrestricted (all properties). */
export const useSetPropertyAccess = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, propertyIds }: { userId: string; propertyIds: string[] }) => {
      const { error: deleteError } = await supabase
        .from("user_property_access")
        .delete()
        .eq("user_id", userId);
      if (deleteError) throw deleteError;

      if (propertyIds.length > 0) {
        const { error: insertError } = await supabase
          .from("user_property_access")
          .insert(propertyIds.map((property_id) => ({ user_id: userId, property_id })));
        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["property-access"] });
      toast.success("Property access updated");
    },
    onError: (error) => {
      toast.error("Failed to update property access: " + error.message);
    },
  });
};

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type AppRole = "admin" | "member" | "viewer";

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
  profile?: {
    full_name: string | null;
    avatar_url: string | null;
  };
  email?: string;
}

export const useCurrentUserRole = () => {
  return useQuery({
    queryKey: ["current-user-role"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from("user_roles")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (error && error.code !== "PGRST116") throw error;
      return data as UserRole | null;
    },
  });
};

export const useIsAdmin = () => {
  const { data: userRole, isLoading } = useCurrentUserRole();
  return {
    isAdmin: userRole?.role === "admin",
    isLoading,
  };
};

export const useTeamMembers = () => {
  return useQuery({
    queryKey: ["team-members"],
    queryFn: async () => {
      // First get all user roles
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("*")
        .order("created_at", { ascending: true });

      if (rolesError) throw rolesError;

      // Then get profiles for those users
      const userIds = roles.map((r) => r.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", userIds);

      if (profilesError) throw profilesError;

      // Combine the data
      const teamMembers: TeamMember[] = roles.map((role) => {
        const profile = profiles?.find((p) => p.user_id === role.user_id);
        return {
          id: role.id,
          user_id: role.user_id,
          role: role.role as AppRole,
          created_at: role.created_at,
          profile: profile
            ? {
                full_name: profile.full_name,
                avatar_url: profile.avatar_url,
              }
            : undefined,
        };
      });

      return teamMembers;
    },
  });
};

export const useUpdateUserRole = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { data, error } = await supabase
        .from("user_roles")
        .update({ role })
        .eq("user_id", userId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      queryClient.invalidateQueries({ queryKey: ["current-user-role"] });
      toast.success("Role updated successfully!");
    },
    onError: (error) => {
      toast.error("Failed to update role: " + error.message);
    },
  });
};

export const useRemoveTeamMember = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      toast.success("Team member removed successfully!");
    },
    onError: (error) => {
      toast.error("Failed to remove team member: " + error.message);
    },
  });
};

export const useInviteTeamMember = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ email, role }: { email: string; role: AppRole }) => {
      // This is a placeholder - in a real app, you'd send an invitation email
      // For now, we'll just show a message about inviting
      // The user will get assigned their role when they sign up via the trigger
      throw new Error("Invite functionality requires email service integration. New users who sign up will be assigned 'member' role by default.");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      toast.success("Invitation sent!");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
};

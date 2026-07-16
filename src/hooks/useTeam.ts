import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getCanonicalAuthRedirectUrl } from "@/lib/authRedirect";

export type AppRole = "super_admin" | "admin" | "member" | "viewer";

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
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as UserRole | null;
    },
  });
};

export const useIsAdmin = () => {
  const { data: userRole, isLoading } = useCurrentUserRole();
  return {
    isAdmin: userRole?.role === "admin" || userRole?.role === "super_admin",
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
    mutationFn: async ({
      email,
      role,
      fullName,
      propertyIds,
    }: {
      email: string;
      role: AppRole;
      fullName?: string;
      /** Restrict the invitee to these properties; omit/empty = access to all properties. */
      propertyIds?: string[];
    }) => {
      const { data, error } = await supabase.functions.invoke("invite-team-member", {
        body: {
          email,
          role,
          full_name: fullName,
          property_ids: propertyIds && propertyIds.length > 0 ? propertyIds : undefined,
          // Always route auth email callbacks through terntripsindia.in.
          redirect_to: getCanonicalAuthRedirectUrl(),
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as {
        success: boolean;
        user_id: string | null;
        invited: boolean;
        setup_email_sent?: boolean;
        invite_link?: string;
        expires_at?: string;
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      toast.success(
        data?.invite_link
          ? "Invite link created. Copy it and send it to the team member."
          : data?.invited
            ? "Invitation email sent!"
            : data?.setup_email_sent
              ? "Existing user added and password setup email sent!"
              : "Existing user added to team!"
      );
    },
    onError: (error: any) => {
      toast.error(error?.message ?? "Failed to invite member");
    },
  });
};

export const useUpdateMemberProfile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, fullName }: { userId: string; fullName: string }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName })
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      toast.success("Profile updated");
    },
    onError: (error: any) => {
      toast.error("Failed to update profile: " + (error?.message ?? "Unknown error"));
    },
  });
};

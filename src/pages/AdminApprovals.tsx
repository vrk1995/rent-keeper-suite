import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useIsSuperAdmin } from "@/hooks/useUserRole";
import { CheckCircle, XCircle, Clock, User, Mail, ShieldCheck } from "lucide-react";

interface PendingUser {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  is_approved: boolean;
  email?: string;
}

const AdminApprovals = () => {
  const queryClient = useQueryClient();
  const { isSuperAdmin, isLoading: superAdminLoading } = useIsSuperAdmin();

  // Fetch all pending users
  const { data: pendingUsers, isLoading } = useQuery({
    queryKey: ["pending-users"],
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url, created_at, is_approved")
        .eq("is_approved", false)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Get emails from auth.users via a separate query if needed
      // For now, we'll just return profiles
      return profiles as PendingUser[];
    },
  });

  // Fetch all approved users for reference
  const { data: approvedUsers } = useQuery({
    queryKey: ["approved-users"],
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url, created_at, is_approved")
        .eq("is_approved", true)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      return profiles as PendingUser[];
    },
  });

  // Approve user mutation
  const approveMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("profiles")
        .update({ is_approved: true })
        .eq("user_id", userId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-users"] });
      queryClient.invalidateQueries({ queryKey: ["approved-users"] });
      toast.success("User approved", {
        description: "The user can now access the dashboard.",
      });
    },
    onError: (error: any) => {
      toast.error("Error", {
        description: error.message || "Failed to approve user",
      });
    },
  });

  // Reject/revoke user mutation
  const rejectMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("profiles")
        .update({ is_approved: false })
        .eq("user_id", userId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-users"] });
      queryClient.invalidateQueries({ queryKey: ["approved-users"] });
      toast.success("Access revoked", {
        description: "The user's access has been revoked.",
      });
    },
    onError: (error: any) => {
      toast.error("Error", {
        description: error.message || "Failed to revoke access",
      });
    },
  });

  if (isLoading || superAdminLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Only super admins can access this page
  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <ShieldCheck className="w-16 h-16 text-muted-foreground/50 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
        <p className="text-muted-foreground">
          Only Super Admins can access this page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
          <ShieldCheck className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-display font-bold">Super Admin Panel</h1>
          <p className="text-muted-foreground">
            Approve new user sign-ups and manage platform access
          </p>
        </div>
      </div>

      {/* Pending Approvals */}
      <Card className="glass border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-warning" />
            Pending Approvals
          </CardTitle>
          <CardDescription>
            Users waiting for approval to access the dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pendingUsers && pendingUsers.length > 0 ? (
            <div className="space-y-4">
              {pendingUsers.map((user) => (
                <motion.div
                  key={user.user_id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between p-4 rounded-xl bg-secondary/30 border border-white/5"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                      <User className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">
                        {user.full_name || "No name provided"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Joined {new Date(user.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-warning border-warning/30">
                      Pending
                    </Badge>
                    <Button
                      size="sm"
                      onClick={() => approveMutation.mutate(user.user_id)}
                      disabled={approveMutation.isPending}
                      className="bg-success hover:bg-success/90"
                    >
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Approve
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="w-12 h-12 mx-auto mb-3 text-success/50" />
              <p>No pending approvals</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recently Approved Users */}
      <Card className="glass border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-success" />
            Approved Users
          </CardTitle>
          <CardDescription>
            Recently approved users (last 20)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {approvedUsers && approvedUsers.length > 0 ? (
            <div className="space-y-3">
              {approvedUsers.map((user) => (
                <div
                  key={user.user_id}
                  className="flex items-center justify-between p-3 rounded-lg bg-secondary/20"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center">
                      <User className="w-4 h-4 text-success" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {user.full_name || "No name"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Joined {new Date(user.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => rejectMutation.mutate(user.user_id)}
                    disabled={rejectMutation.isPending}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <XCircle className="w-4 h-4 mr-1" />
                    Revoke
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center py-4 text-muted-foreground">
              No approved users yet
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminApprovals;

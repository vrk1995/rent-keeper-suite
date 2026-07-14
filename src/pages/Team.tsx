import { useState } from "react";
import { motion } from "framer-motion";
import { Users, Shield, UserCog, Eye, Crown, Trash2, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  useTeamMembers, 
  useCurrentUserRole, 
  useUpdateUserRole, 
  useRemoveTeamMember,
  useUpdateMemberProfile,
  AppRole 
} from "@/hooks/useTeam";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { AddTeamMemberDialog } from "@/components/team/AddTeamMemberDialog";
import { ErrorState } from "@/components/ui/error-state";

const roleConfig: Record<AppRole, { label: string; icon: React.ElementType; color: string; description: string }> = {
  super_admin: {
    label: "Super Admin",
    icon: Crown,
    color: "text-purple-500",
    description: "Full system access including team management",
  },
  admin: {
    label: "Admin",
    icon: Crown,
    color: "text-amber-500",
    description: "Full access to all features and settings"
  },
  member: {
    label: "Member",
    icon: UserCog,
    color: "text-blue-500",
    description: "Can record payments and view/download invoices; cannot add or edit properties, tenants, or other setup data"
  },
  viewer: {
    label: "Viewer",
    icon: Eye,
    color: "text-muted-foreground",
    description: "Read-only access to view data"
  },
};

const Team = () => {
  const { data: teamMembers, isLoading, isError, refetch } = useTeamMembers();
  const { data: currentUserRole } = useCurrentUserRole();
  const updateRole = useUpdateUserRole();
  const removeMember = useRemoveTeamMember();
  const updateProfile = useUpdateMemberProfile();

  const [removeMemberId, setRemoveMemberId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  
  // Get current user
  const { data: currentUser } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    },
  });

  const isAdmin = currentUserRole?.role === "admin" || currentUserRole?.role === "super_admin";
  const memberToRemove = teamMembers?.find(m => m.user_id === removeMemberId);
  const memberToEdit = teamMembers?.find(m => m.user_id === editingId);

  const handleRoleChange = async (userId: string, newRole: AppRole) => {
    await updateRole.mutateAsync({ userId, role: newRole });
  };

  const handleRemoveMember = async () => {
    if (removeMemberId) {
      await removeMember.mutateAsync(removeMemberId);
      setRemoveMemberId(null);
    }
  };

  const openEdit = (userId: string, currentName: string | null | undefined) => {
    setEditingId(userId);
    setEditName(currentName ?? "");
  };

  const handleSaveName = async () => {
    if (!editingId) return;
    await updateProfile.mutateAsync({ userId: editingId, fullName: editName.trim() });
    setEditingId(null);
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Team</h1>
          <p className="text-muted-foreground">Manage your team members and their roles</p>
        </div>
        {isAdmin && <AddTeamMemberDialog />}
      </div>

      {/* Role Legend */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

        {(Object.entries(roleConfig) as [AppRole, typeof roleConfig.admin][]).map(([role, config]) => (
          <Card key={role} className="border-dashed">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-muted ${config.color}`}>
                  <config.icon className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="font-medium">{config.label}</h4>
                  <p className="text-xs text-muted-foreground">{config.description}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Team Members List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Members ({teamMembers?.length || 0})
          </CardTitle>
          <CardDescription>
            {isAdmin 
              ? "As an admin, you can change roles and remove members"
              : "Contact an admin to change team member roles"
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-muted/30 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : teamMembers?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No team members found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {teamMembers?.map((member, index) => {
                const config = roleConfig[member.role];
                const isCurrentUser = member.user_id === currentUser?.id;
                const canModify = isAdmin && !isCurrentUser;
                
                return (
                  <motion.div
                    key={member.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={member.profile?.avatar_url || undefined} />
                        <AvatarFallback>
                          {getInitials(member.profile?.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {member.profile?.full_name || "Unnamed User"}
                          </span>
                          {isCurrentUser && (
                            <Badge variant="outline" className="text-xs">You</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Member since {new Date(member.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {canModify ? (
                        <Select
                          value={member.role}
                          onValueChange={(value) => handleRoleChange(member.user_id, value as AppRole)}
                          disabled={updateRole.isPending}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">
                              <div className="flex items-center gap-2">
                                <Crown className="h-3 w-3 text-amber-500" />
                                Admin
                              </div>
                            </SelectItem>
                            <SelectItem value="member">
                              <div className="flex items-center gap-2">
                                <UserCog className="h-3 w-3 text-blue-500" />
                                Member
                              </div>
                            </SelectItem>
                            <SelectItem value="viewer">
                              <div className="flex items-center gap-2">
                                <Eye className="h-3 w-3 text-muted-foreground" />
                                Viewer
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <config.icon className={`h-3 w-3 ${config.color}`} />
                          {config.label}
                        </Badge>
                      )}
                      
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Edit name"
                          onClick={() => openEdit(member.user_id, member.profile?.full_name)}
                          title="Edit name"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}

                      {canModify && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Remove team member"
                          onClick={() => setRemoveMemberId(member.user_id)}
                          disabled={removeMember.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info for non-admins */}
      {!isAdmin && (
        <Card className="border-dashed">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-muted-foreground">
              <Shield className="h-5 w-5" />
              <p className="text-sm">
                Only admins can modify team member roles. Contact your team admin if you need role changes.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Remove Member Dialog */}
      <AlertDialog open={!!removeMemberId} onOpenChange={() => setRemoveMemberId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove "{memberToRemove?.profile?.full_name || 'this member'}" from the team? 
              They will lose access to all team resources.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveMember}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Name Dialog */}
      <Dialog open={!!editingId} onOpenChange={(o) => !o && setEditingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit team member</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="edit-name">Full name</Label>
            <Input
              id="edit-name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Jane Doe"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
            <Button onClick={handleSaveName} disabled={updateProfile.isPending}>
              {updateProfile.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Team;

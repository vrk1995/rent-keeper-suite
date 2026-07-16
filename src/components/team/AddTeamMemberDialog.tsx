import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserPlus } from "lucide-react";
import { useInviteTeamMember, AppRole } from "@/hooks/useTeam";
import { useProperties } from "@/hooks/useProperties";
import { toast } from "sonner";

export const AddTeamMemberDialog = () => {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<AppRole>("member");
  const [accessScope, setAccessScope] = useState<"all" | "selected">("all");
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
  const [inviteLink, setInviteLink] = useState("");
  const invite = useInviteTeamMember();
  // Only properties the inviter can see — a scoped admin can't offer what they don't have.
  const { data: properties } = useProperties();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    if (accessScope === "selected" && selectedPropertyIds.length === 0) {
      toast.error("Select at least one property, or choose access to all properties");
      return;
    }
    try {
      const result = await invite.mutateAsync({
        email: email.trim(),
        role,
        fullName: fullName.trim() || undefined,
        propertyIds: accessScope === "selected" ? selectedPropertyIds : undefined,
      });
      setInviteLink(result.invite_link ?? "");
      setEmail("");
      setFullName("");
      setRole("member");
      setAccessScope("all");
      setSelectedPropertyIds([]);
    } catch {
      /* toast handled in hook */
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (!nextOpen) setInviteLink("");
    }}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="h-4 w-4 mr-2" />
          Add Member
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Team Member</DialogTitle>
          <DialogDescription>
            Create an invite link for the member to open on terntripsindia.in and set their password.
          </DialogDescription>
        </DialogHeader>
        {inviteLink && (
          <div className="space-y-2 rounded-lg border bg-secondary/30 p-3">
            <Label htmlFor="invite-link">Invite link</Label>
            <Input id="invite-link" value={inviteLink} readOnly />
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={async () => {
                await navigator.clipboard.writeText(inviteLink);
                toast.success("Invite link copied");
              }}
            >
              Copy Link
            </Button>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="member@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Full name (optional)</Label>
            <Input
              id="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Doe"
            />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Property Access</Label>
            <RadioGroup
              value={accessScope}
              onValueChange={(v) => setAccessScope(v as "all" | "selected")}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="all" id="access-all" />
                <Label htmlFor="access-all" className="font-normal cursor-pointer">All properties</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="selected" id="access-selected" />
                <Label htmlFor="access-selected" className="font-normal cursor-pointer">Selected properties only</Label>
              </div>
            </RadioGroup>
            {accessScope === "selected" && (
              <div className="space-y-2 rounded-lg border p-3 max-h-40 overflow-y-auto">
                {(properties || []).map((p) => {
                  const checked = selectedPropertyIds.includes(p.id);
                  return (
                    <div key={p.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`invite-prop-${p.id}`}
                        checked={checked}
                        onCheckedChange={(isChecked) =>
                          setSelectedPropertyIds((prev) =>
                            isChecked ? [...prev, p.id] : prev.filter((id) => id !== p.id)
                          )
                        }
                      />
                      <Label htmlFor={`invite-prop-${p.id}`} className="text-sm font-normal cursor-pointer">
                        {p.name}
                      </Label>
                    </div>
                  );
                })}
                {(properties || []).length === 0 && (
                  <p className="text-xs text-muted-foreground">No properties available</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={invite.isPending}>
              {invite.isPending ? "Adding..." : "Add Member"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

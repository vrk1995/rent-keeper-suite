import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Building2, Lock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const SetPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [invitedBy, setInvitedBy] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const inviteToken = searchParams.get("invite")?.trim() ?? "";

  useEffect(() => {
    (async () => {
      if (inviteToken) {
        const { data, error } = await supabase.functions.invoke("get-team-invite", {
          body: { token: inviteToken },
        });
        if (error || (data as any)?.error) {
          toast.error("Invitation expired or invalid", {
            description: (data as any)?.error || error?.message || "Please ask your admin to re-send the invitation.",
          });
          navigate("/auth");
          return;
        }
        setEmail((data as any).email ?? "");
        setFullName((data as any).full_name ?? "");
        setInvitedBy((data as any).invited_by_name ?? "");
        setReady(true);
        return;
      }

      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        toast.error("Invitation expired or invalid", {
          description: "Please ask your admin to re-send the invitation.",
        });
        navigate("/auth");
        return;
      }
      const metadata = (data.user.user_metadata ?? {}) as Record<string, string>;
      setEmail(data.user.email ?? "");
      setFullName(metadata.full_name ?? "");
      setInvitedBy(metadata.invited_by_name ?? "");
      setReady(true);
    })();
  }, [inviteToken, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password too short", { description: "Min 6 characters." });
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      if (inviteToken) {
        const { data, error } = await supabase.functions.invoke("accept-team-invite", {
          body: { token: inviteToken, password, full_name: fullName },
        });
        if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);

        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;

        toast.success("Welcome aboard!", { description: "Your account is ready." });
        navigate("/dashboard");
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password,
        data: { full_name: fullName },
      });
      if (error) throw error;

      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        await supabase
          .from("profiles")
          .upsert({ user_id: u.user.id, full_name: fullName }, { onConflict: "user_id" });
      }

      toast.success("Welcome aboard!", { description: "Your password has been set." });
      navigate("/dashboard");
    } catch (err: any) {
      toast.error("Error", { description: err.message ?? "Failed to set password" });
    } finally {
      setLoading(false);
    }
  };

  if (!ready) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">
          {inviteToken ? "Verifying your invitation…" : "Verifying your reset link…"}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-pulse-glow" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/20 rounded-full blur-3xl animate-pulse-glow" style={{ animationDelay: "1.5s" }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="glass-strong rounded-3xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
              <Building2 className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold">
                {inviteToken ? "Join RentKeeper" : "Reset your password"}
              </h1>
              <p className="text-sm text-muted-foreground">{email}</p>
            </div>
          </div>

          <p className="mb-6 text-sm text-muted-foreground">
            {inviteToken
              ? invitedBy
                ? `${invitedBy} has invited you to sign up on RentKeeper.`
                : "You have been invited to sign up on RentKeeper."
              : "Choose a new password for your RentKeeper account."}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="pl-10 bg-secondary/50 border-white/10"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw">New Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="pw"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 bg-secondary/50 border-white/10"
                  minLength={6}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cpw">Confirm Password</Label>
              <Input
                id="cpw"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="bg-secondary/50 border-white/10"
                minLength={6}
                required
              />
            </div>
            <Button type="submit" variant="hero" size="lg" className="w-full" disabled={loading}>
              {loading ? "Saving…" : inviteToken ? "Set Password & Continue" : "Update Password"}
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
};

export default SetPassword;

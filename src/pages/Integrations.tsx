import { useState } from "react";
import { Plug, Copy, Check, Plus, Loader2, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { formatIST } from "@/lib/dateFormat";
import { useMcpTokens, useCreateMcpToken, useRevokeMcpToken, McpToken } from "@/hooks/useMcpTokens";
import { toast } from "sonner";

const MCP_SERVER_URL = "https://lqwsnhjavgdrfuzgdywy.supabase.co/functions/v1/mcp-server";

const Integrations = () => {
  const { data: tokens, isLoading } = useMcpTokens();
  const createToken = useCreateMcpToken();
  const revokeToken = useRevokeMcpToken();

  const [newTokenName, setNewTokenName] = useState("Claude");
  const [createOpen, setCreateOpen] = useState(false);
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<McpToken | null>(null);

  const connectorUrl = issuedToken ? `${MCP_SERVER_URL}?token=${issuedToken}` : "";

  const handleCreate = async () => {
    const result = await createToken.mutateAsync(newTokenName.trim() || "Claude");
    setIssuedToken(result.token);
    setCreateOpen(false);
    setNewTokenName("Claude");
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(connectorUrl);
    setCopied(true);
    toast.success("Copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-display font-bold">Integrations</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Connect Claude to ask about rent status, overdue payments, and tenant history in plain English.
        </p>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-6 flex gap-3">
          <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm space-y-1">
            <p className="font-medium">Read-only, and scoped to exactly what you can already see</p>
            <p className="text-muted-foreground">
              Claude can only look things up — it cannot record a payment, generate a receipt, edit
              a tenant, or change anything. It also only ever sees the properties your own account
              has access to, the same as if you were using the app yourself.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Plug className="w-4 h-4" />
            Claude connection tokens
          </CardTitle>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            New Token
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : !tokens || tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No tokens yet — create one to connect Claude.
            </p>
          ) : (
            <div className="space-y-2">
              {tokens.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium flex items-center gap-2">
                      {t.name}
                      {t.revoked_at ? (
                        <Badge variant="secondary" className="text-xs">Revoked</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">Active</Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Created {formatIST(t.created_at)}
                      {t.last_used_at ? ` · Last used ${formatIST(t.last_used_at)}` : " · Never used yet"}
                    </p>
                  </div>
                  {!t.revoked_at && (
                    <Button variant="ghost" size="sm" onClick={() => setRevokeTarget(t)}>
                      Revoke
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">How to connect</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2 text-muted-foreground">
          <p>1. Click "New Token" above and copy the connector link it gives you (shown once).</p>
          <p>2. In Claude, go to Settings → Connectors → Add custom connector, and paste that link in as the URL.</p>
          <p>3. Ask things like "what's overdue this month?" or "what's the rent status for [tenant]?".</p>
          <p>If you ever want to disconnect Claude, just revoke the token above — no other changes needed.</p>
        </CardContent>
      </Card>

      {/* Create token dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Claude Connection</DialogTitle>
            <DialogDescription>Give it a name so you can recognize it later.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Name</Label>
            <Input value={newTokenName} onChange={(e) => setNewTokenName(e.target.value)} placeholder="Claude" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createToken.isPending}>
              {createToken.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Show the issued token/link exactly once */}
      <Dialog open={!!issuedToken} onOpenChange={(o) => !o && setIssuedToken(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Your connector link</DialogTitle>
            <DialogDescription>
              Copy this now — for your security, it won't be shown again. Paste it as the URL when
              adding a custom connector in Claude.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-lg border bg-secondary/30 p-3">
            <code className="text-xs break-all flex-1">{connectorUrl}</code>
            <Button variant="outline" size="icon" onClick={handleCopy} aria-label="Copy link">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setIssuedToken(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!revokeTarget} onOpenChange={(o) => !o && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke "{revokeTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Claude will no longer be able to answer questions using this connection. You can always
              create a new one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (revokeTarget) revokeToken.mutate(revokeTarget.id);
                setRevokeTarget(null);
              }}
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Integrations;

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type State = "loading" | "ready" | "already" | "invalid" | "submitting" | "done" | "error";

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!token) {
      setState("invalid");
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`,
          { headers: { apikey: SUPABASE_ANON_KEY } }
        );
        const data = await res.json();
        if (data.valid) setState("ready");
        else if (data.reason === "already_unsubscribed") setState("already");
        else setState("invalid");
      } catch (e: any) {
        setError(e?.message ?? "Network error");
        setState("error");
      }
    })();
  }, [token]);

  const confirm = async () => {
    if (!token) return;
    setState("submitting");
    const { data, error: err } = await supabase.functions.invoke("handle-email-unsubscribe", {
      body: { token },
    });
    if (err) {
      setError(err.message);
      setState("error");
      return;
    }
    if (data?.success || data?.reason === "already_unsubscribed") setState("done");
    else setState("error");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Unsubscribe from Rent Keeper emails</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {state === "loading" && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Verifying your link…
            </div>
          )}
          {state === "ready" && (
            <>
              <p className="text-sm text-muted-foreground">
                Click below to confirm you no longer want to receive emails from Rent Keeper.
              </p>
              <Button onClick={confirm} className="w-full">Confirm unsubscribe</Button>
            </>
          )}
          {state === "submitting" && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Processing…
            </div>
          )}
          {state === "done" && (
            <div className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
              <span>You've been unsubscribed. You will no longer receive emails from us.</span>
            </div>
          )}
          {state === "already" && (
            <div className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
              <span>This email is already unsubscribed.</span>
            </div>
          )}
          {state === "invalid" && (
            <div className="flex items-start gap-2 text-sm">
              <XCircle className="h-5 w-5 text-destructive mt-0.5" />
              <span>This unsubscribe link is invalid or has expired.</span>
            </div>
          )}
          {state === "error" && (
            <div className="flex items-start gap-2 text-sm">
              <XCircle className="h-5 w-5 text-destructive mt-0.5" />
              <span>Something went wrong{error ? `: ${error}` : "."}. Please try again later.</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type InvoiceGenSource = "cron" | "preview" | "manual";
export type InvoiceGenOutcome = "created" | "reused" | "blocked" | "failed";

export interface InvoiceAuditActor {
  source: InvoiceGenSource;
  userId: string | null;
  userName: string | null;
}

/**
 * Who asked for this invoice, and why. Requests signed with the service-role key come from
 * the scheduled generator (no human actor); everything else carries a user session, and the
 * caller tells us whether it was a passive PDF preview or an explicit manual action.
 */
export async function resolveInvoiceActor(
  req: Request,
  supabaseUrl: string,
  supabaseServiceKey: string,
  requestedSource?: string,
): Promise<InvoiceAuditActor> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const callerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (callerToken === supabaseServiceKey) {
    return { source: "cron", userId: null, userName: null };
  }

  const source: InvoiceGenSource =
    requestedSource === "manual" || requestedSource === "cron" ? "manual" : "preview";

  try {
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!anonKey) return { source, userId: null, userName: null };
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data } = await userClient.auth.getUser();
    const userId = data?.user?.id ?? null;
    if (!userId) return { source, userId: null, userName: null };

    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name")
      .eq("user_id", userId)
      .maybeSingle();

    return {
      source,
      userId,
      userName: (profile as any)?.full_name || data?.user?.email || null,
    };
  } catch {
    return { source, userId: null, userName: null };
  }
}

/** Best-effort audit write — never allowed to break invoice generation itself. */
export async function logInvoiceGeneration(
  admin: ReturnType<typeof createClient>,
  entry: {
    workspaceId: string | null;
    invoiceId?: string | null;
    rentPaymentId?: string | null;
    invoiceNumber?: string | null;
    invoiceDate?: string | null;
    outcome: InvoiceGenOutcome;
    reason?: string | null;
    actor: InvoiceAuditActor;
  },
): Promise<void> {
  if (!entry.workspaceId) return;
  try {
    await admin.from("invoice_generation_log").insert({
      workspace_id: entry.workspaceId,
      invoice_id: entry.invoiceId ?? null,
      rent_payment_id: entry.rentPaymentId ?? null,
      invoice_number: entry.invoiceNumber ?? null,
      invoice_date: entry.invoiceDate ?? null,
      source: entry.actor.source,
      outcome: entry.outcome,
      reason: entry.reason ?? null,
      triggered_by: entry.actor.userId,
      triggered_by_name: entry.actor.userName,
    });
  } catch (err) {
    console.error("invoice audit log failed:", err);
  }
}

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveCallerScope, CallerScope } from "../_shared/callerScope.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, mcp-protocol-version",
};

const SERVER_NAME = "rent-keeper-suite";
const SERVER_VERSION = "1.1.0";

const SERVER_INSTRUCTIONS = `This server lets you look up properties, tenants, and rent payments, and — for one
specific workflow — record a payment.

Recording a payment from a pasted bank message (SMS/email showing money received):
1. Call find_matching_payment with the amount (and tenant name if the message gives one).
2. For each candidate, tell the user the tenant, property, and rent PERIOD (the month the
   rent is for, e.g. "July 2026" — not the month the invoice was raised) along with the
   amount. If a candidate's breakdown involves GST/TDS, say so plainly (e.g. "rent minus
   10% TDS").
3. Wait for the user to explicitly confirm which one it is (or that none are right) before
   doing anything else. Never call mark_payment_received on your own judgement alone.
4. If none of the candidates are right, ask the user which month the rent being paid is
   for, then call list_due_payments_for_month with that month and present the results as
   a numbered list for them to pick from.
5. Once confirmed, call mark_payment_received with confirmed:true. If it reports
   duplicate_warning, tell the user and only retry with force:true if they say to record
   it anyway.

mark_payment_received requires the account to have payment-recording permission
(super_admin/admin/member, not viewer) and only ever touches properties the caller
already has access to — it will reject anything else.`;

// ---------------------------------------------------------------------------
// Tool schemas. Most of these are read-only, scoped to the caller's own
// workspace and property access (see resolveCallerScope). The three
// payment-matching tools at the end are the one write path this server
// offers — mark_payment_received is gated on scope.canRecordPayments and on
// an explicit confirmed:true flag, so it can never fire without both a
// permission check and the calling model having gotten the human's go-ahead.
// ---------------------------------------------------------------------------
const TOOLS = [
  {
    name: "list_properties",
    description: "List the properties this account can see.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_tenants",
    description: "List tenants, optionally filtered by property name or status (active/vacated).",
    inputSchema: {
      type: "object",
      properties: {
        property_name: { type: "string", description: "Partial, case-insensitive property name to filter by." },
        status: { type: "string", description: "Filter by tenant status, e.g. 'active' or 'vacated'." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_tenant_rent_status",
    description:
      "Look up a tenant's current rent status: monthly rent, most recent due payment, whether it's paid/pending/overdue/partial, and their total overdue balance.",
    inputSchema: {
      type: "object",
      properties: {
        tenant_name: { type: "string", description: "Tenant's name (or part of it)." },
      },
      required: ["tenant_name"],
      additionalProperties: false,
    },
  },
  {
    name: "list_overdue_payments",
    description: "List every currently-overdue rent payment, with tenant, property, amount and how much remains unpaid.",
    inputSchema: {
      type: "object",
      properties: {
        property_name: { type: "string", description: "Optional partial property name to filter by." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_payment_history",
    description: "Get a tenant's recent rent payment / receipt history.",
    inputSchema: {
      type: "object",
      properties: {
        tenant_name: { type: "string", description: "Tenant's name (or part of it)." },
        limit: { type: "number", description: "How many recent payments to return (default 12, max 50)." },
      },
      required: ["tenant_name"],
      additionalProperties: false,
    },
  },
  {
    name: "find_matching_payment",
    description:
      "Use this when the user pastes a bank payment notification (SMS/email) reporting money received, so you can figure out which tenant's rent it settles. Pass the amount the bank credited; add tenant_name_hint if the message names anyone. Returns candidate unpaid rent payments (pending/overdue/partial) in the caller's scope, each with tenant, property, rent PERIOD (the month the rent is for — not when the invoice was raised), amount due, remaining due, and the plausible cash breakdowns given that tenant's GST/TDS settings (e.g. rent alone, rent minus TDS, rent plus GST). Always show the tenant, property, and period back to the user for confirmation before calling mark_payment_received — never guess and commit silently. If none of the candidates look right, don't force a match: ask the user which month the rent is for and call list_due_payments_for_month instead.",
    inputSchema: {
      type: "object",
      properties: {
        amount: { type: "number", description: "The cash amount the bank message reports as credited." },
        tenant_name_hint: { type: "string", description: "Tenant name if the message mentions one (optional)." },
      },
      required: ["amount"],
      additionalProperties: false,
    },
  },
  {
    name: "list_due_payments_for_month",
    description:
      "Fallback for when find_matching_payment's candidates don't look right to the user. Ask the user which month the rent being paid is FOR (not the invoice month), then call this with that month to list every unpaid rent payment (pending/overdue/partial) due in it, in the caller's scope. Present the results as a numbered list (tenant, property, amount due) and have the user pick one before calling mark_payment_received.",
    inputSchema: {
      type: "object",
      properties: {
        month: { type: "string", description: "The rent period as YYYY-MM, e.g. '2026-07' for July 2026." },
      },
      required: ["month"],
      additionalProperties: false,
    },
  },
  {
    name: "mark_payment_received",
    description:
      "Records a payment against a specific rent_payment row. ONLY call this after the user has explicitly confirmed, in this conversation, which payment it is and which cash breakdown is correct (confirmed must be true, or the call is rejected) — never as the first response to a pasted bank message. gross_rent_settled is the RENT portion being cleared (before GST/TDS), capped at that payment's remaining due; pass tds_amount/gst_amount only if the confirmed breakdown includes them. If the tool reports duplicate_warning (a very similar transaction was already recorded recently), tell the user and only retry with force:true if they explicitly say to record it anyway.",
    inputSchema: {
      type: "object",
      properties: {
        payment_id: { type: "string", description: "The rent_payments id from find_matching_payment or list_due_payments_for_month." },
        gross_rent_settled: { type: "number", description: "Rent amount being settled, before GST/TDS. Must be > 0 and <= remaining due." },
        tds_applicable: { type: "boolean", description: "Whether TDS was deducted from this receipt. Default false." },
        tds_amount: { type: "number", description: "TDS amount deducted, if tds_applicable. Default 0." },
        gst_applicable: { type: "boolean", description: "Whether GST was collected on top of this receipt. Default false." },
        gst_amount: { type: "number", description: "GST amount collected, if gst_applicable. Default 0." },
        paid_date: { type: "string", description: "Date the payment was received, YYYY-MM-DD." },
        payment_method: { type: "string", description: "Defaults to 'bank_transfer' — this tool is for bank payment notifications." },
        notes: { type: "string", description: "Optional note, e.g. a snippet of the bank message." },
        confirmed: { type: "boolean", description: "Must be true. Confirms the human has approved this exact match and amount in the conversation." },
        force: { type: "boolean", description: "Set true only after the user has been warned about a likely duplicate and still wants to proceed." },
      },
      required: ["payment_id", "gross_rent_settled", "paid_date", "confirmed"],
      additionalProperties: false,
    },
  },
] as const;

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------
type Admin = ReturnType<typeof createClient>;

async function listProperties(admin: Admin, scope: CallerScope) {
  let q = admin.from("properties").select("id, name, address, status").eq("workspace_id", scope.workspaceId!);
  if (scope.propertyIds) q = q.in("id", scope.propertyIds);
  const { data, error } = await q.order("name");
  if (error) throw error;
  return data;
}

async function listTenants(admin: Admin, scope: CallerScope, args: any) {
  let q = admin
    .from("tenants")
    .select("id, name, status, monthly_rent, property:properties(id, name)")
    .eq("workspace_id", scope.workspaceId!);
  if (scope.propertyIds) q = q.in("property_id", scope.propertyIds);
  if (args?.status) q = q.eq("status", args.status);
  const { data, error } = await q.order("name");
  if (error) throw error;
  let rows = (data as any[]) ?? [];
  if (args?.property_name) {
    const needle = String(args.property_name).toLowerCase();
    rows = rows.filter((r) => r.property?.name?.toLowerCase().includes(needle));
  }
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    monthly_rent: r.monthly_rent,
    property: r.property?.name ?? null,
  }));
}

/** Resolves a fuzzy tenant name to exactly one tenant within the caller's scope, or reports
 *  no-match / multiple-matches so the caller (the LLM) can ask a clarifying question instead
 *  of silently guessing wrong. */
async function findTenant(admin: Admin, scope: CallerScope, tenantName: string) {
  const name = (tenantName ?? "").trim();
  if (!name) throw new Error("tenant_name is required");

  let q = admin
    .from("tenants")
    .select("id, name, property:properties(id, name)")
    .eq("workspace_id", scope.workspaceId!)
    .ilike("name", `%${name}%`);
  if (scope.propertyIds) q = q.in("property_id", scope.propertyIds);
  const { data, error } = await q;
  if (error) throw error;
  const matches = (data as any[]) ?? [];

  if (matches.length === 0) {
    return { tenant: null, ambiguous: null as any };
  }
  if (matches.length > 1) {
    return {
      tenant: null,
      ambiguous: matches.map((m) => ({ id: m.id, name: m.name, property: m.property?.name ?? null })),
    };
  }
  return { tenant: matches[0], ambiguous: null as any };
}

async function getTenantRentStatus(admin: Admin, scope: CallerScope, args: any) {
  const { tenant, ambiguous } = await findTenant(admin, scope, args?.tenant_name);
  if (ambiguous) {
    return { found: false, multiple_matches: ambiguous, message: "Multiple tenants matched — ask which one." };
  }
  if (!tenant) {
    return { found: false, message: `No tenant matching "${args?.tenant_name}" in the properties you can access.` };
  }

  const { data: payments, error: payErr } = await admin
    .from("rent_payments")
    .select("due_date, amount, status, paid_amount, paid_date")
    .eq("tenant_id", tenant.id)
    .order("due_date", { ascending: false })
    .limit(1);
  if (payErr) throw payErr;
  const current = ((payments as any[]) ?? [])[0] ?? null;

  const { data: overdue, error: overErr } = await admin
    .from("rent_payments")
    .select("amount, paid_amount")
    .eq("tenant_id", tenant.id)
    .eq("status", "overdue");
  if (overErr) throw overErr;
  const overdueRows = (overdue as any[]) ?? [];
  const overdueTotal = overdueRows.reduce((s, r) => s + (Number(r.amount) - Number(r.paid_amount || 0)), 0);

  return {
    found: true,
    tenant: { id: tenant.id, name: tenant.name, property: tenant.property?.name ?? null },
    current_payment: current
      ? {
          due_date: current.due_date,
          amount: current.amount,
          status: current.status,
          paid_amount: current.paid_amount,
          remaining: Number(current.amount) - Number(current.paid_amount || 0),
          paid_date: current.paid_date,
        }
      : null,
    overdue_count: overdueRows.length,
    overdue_total: overdueTotal,
  };
}

async function listOverduePayments(admin: Admin, scope: CallerScope, args: any) {
  let q = admin
    .from("rent_payments")
    .select("due_date, amount, paid_amount, tenant:tenants(name), property:properties(name)")
    .eq("workspace_id", scope.workspaceId!)
    .eq("status", "overdue");
  if (scope.propertyIds) q = q.in("property_id", scope.propertyIds);
  const { data, error } = await q.order("due_date", { ascending: true });
  if (error) throw error;
  let rows = (data as any[]) ?? [];
  if (args?.property_name) {
    const needle = String(args.property_name).toLowerCase();
    rows = rows.filter((r) => r.property?.name?.toLowerCase().includes(needle));
  }
  return rows.map((r) => ({
    tenant: r.tenant?.name ?? null,
    property: r.property?.name ?? null,
    due_date: r.due_date,
    amount: r.amount,
    paid_amount: r.paid_amount,
    remaining: Number(r.amount) - Number(r.paid_amount || 0),
  }));
}

async function getPaymentHistory(admin: Admin, scope: CallerScope, args: any) {
  const { tenant, ambiguous } = await findTenant(admin, scope, args?.tenant_name);
  if (ambiguous) {
    return { found: false, multiple_matches: ambiguous, message: "Multiple tenants matched — ask which one." };
  }
  if (!tenant) {
    return { found: false, message: `No tenant matching "${args?.tenant_name}" in the properties you can access.` };
  }

  const limit = Math.min(Math.max(parseInt(args?.limit, 10) || 12, 1), 50);
  const { data: payments, error } = await admin
    .from("rent_payments")
    .select("due_date, amount, status, paid_amount, paid_date, payment_method")
    .eq("tenant_id", tenant.id)
    .order("due_date", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return {
    found: true,
    tenant: { name: tenant.name, property: tenant.property?.name ?? null },
    payments,
  };
}

const TDS_RATE = 0.1;
const GST_RATE = 0.18;
const roundRupee = (n: number) => Math.round(n);

/** The month rent is FOR, e.g. "July 2026" — from billing_month if set, else the due
 *  date's month. Deliberately not the invoice date, which can differ (e.g. arrears billing). */
function periodLabel(billingMonth: string | null | undefined, dueDate: string): string {
  if (billingMonth) {
    const [y, m] = billingMonth.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  }
  return new Date(dueDate).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Plausible cash amounts for settling `remaining` in full, given a tenant's GST/TDS
 *  defaults — used both to explain a candidate to the user and to score how well a bank
 *  amount matches it. */
function settlementVariants(remaining: number, tdsApplicable: boolean, gstApplicable: boolean) {
  const variants: { label: string; cash_amount: number }[] = [
    { label: "Rent only (no GST/TDS)", cash_amount: roundRupee(remaining) },
  ];
  const tds = roundRupee(remaining * TDS_RATE);
  const gst = roundRupee(remaining * GST_RATE);
  if (tdsApplicable) variants.push({ label: "Rent minus 10% TDS", cash_amount: remaining - tds });
  if (gstApplicable) variants.push({ label: "Rent plus 18% GST", cash_amount: remaining + gst });
  if (tdsApplicable && gstApplicable) {
    variants.push({ label: "Rent plus GST minus TDS", cash_amount: remaining + gst - tds });
  }
  return variants;
}

async function findMatchingPayment(admin: Admin, scope: CallerScope, args: any) {
  const amount = Number(args?.amount);
  if (!amount || amount <= 0) throw new Error("amount is required and must be greater than 0");

  let q = admin
    .from("rent_payments")
    .select(
      "id, due_date, billing_month, amount, paid_amount, tenant:tenants(name, tds_applicable, requires_gst), property:properties(name)"
    )
    .eq("workspace_id", scope.workspaceId!)
    .in("status", ["pending", "overdue", "partial"]);
  if (scope.propertyIds) q = q.in("property_id", scope.propertyIds);
  const { data, error } = await q.order("due_date", { ascending: true }).limit(300);
  if (error) throw error;

  let rows = (data as any[]) ?? [];
  if (args?.tenant_name_hint) {
    const needle = String(args.tenant_name_hint).toLowerCase();
    rows = rows.filter((r) => r.tenant?.name?.toLowerCase().includes(needle));
  }

  const scored = rows.map((r) => {
    const remaining = Number(r.amount) - Number(r.paid_amount || 0);
    const variants = settlementVariants(remaining, !!r.tenant?.tds_applicable, !!r.tenant?.requires_gst);
    const bestDiff = Math.min(...variants.map((v) => Math.abs(v.cash_amount - amount)));
    let match: "exact" | "close" | "partial_possible" | null = null;
    if (bestDiff <= 1) match = "exact";
    else if (bestDiff / Math.max(remaining, 1) <= 0.02) match = "close";
    else if (amount > 0 && amount < remaining) match = "partial_possible";
    return { r, remaining, variants, bestDiff, match };
  });

  const ranked = scored
    .filter((s) => s.match !== null)
    .sort((a, b) => {
      const order = { exact: 0, close: 1, partial_possible: 2 } as const;
      const oa = order[a.match as keyof typeof order];
      const ob = order[b.match as keyof typeof order];
      if (oa !== ob) return oa - ob;
      return a.bestDiff - b.bestDiff;
    })
    .slice(0, 8);

  return {
    candidates: ranked.map(({ r, remaining, variants, match }) => ({
      payment_id: r.id,
      tenant: r.tenant?.name ?? null,
      property: r.property?.name ?? null,
      period: periodLabel(r.billing_month, r.due_date),
      due_date: r.due_date,
      amount_due: Number(r.amount),
      already_paid: Number(r.paid_amount || 0),
      remaining_due: remaining,
      tds_applicable_default: !!r.tenant?.tds_applicable,
      gst_applicable_default: !!r.tenant?.requires_gst,
      possible_breakdowns: variants,
      match_quality: match,
    })),
    guidance:
      ranked.length === 0
        ? "No unpaid rent payment in scope plausibly matches this amount. Ask the user which month the rent is for, then call list_due_payments_for_month."
        : "Show the tenant, property, and period (the rent month, not invoice month) back to the user and get explicit confirmation of the amount breakdown before calling mark_payment_received.",
  };
}

async function listDuePaymentsForMonth(admin: Admin, scope: CallerScope, args: any) {
  const month = String(args?.month ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("month is required as YYYY-MM, e.g. 2026-07");

  let q = admin
    .from("rent_payments")
    .select(
      "id, due_date, billing_month, amount, paid_amount, tenant:tenants(name), property:properties(name)"
    )
    .eq("workspace_id", scope.workspaceId!)
    .in("status", ["pending", "overdue", "partial"]);
  if (scope.propertyIds) q = q.in("property_id", scope.propertyIds);
  const { data, error } = await q.order("due_date", { ascending: true });
  if (error) throw error;

  const rows = ((data as any[]) ?? []).filter((r) => {
    if (r.billing_month) return r.billing_month === month;
    return String(r.due_date).slice(0, 7) === month;
  });

  return {
    payments: rows.map((r) => ({
      payment_id: r.id,
      tenant: r.tenant?.name ?? null,
      property: r.property?.name ?? null,
      period: periodLabel(r.billing_month, r.due_date),
      due_date: r.due_date,
      amount_due: Number(r.amount),
      already_paid: Number(r.paid_amount || 0),
      remaining_due: Number(r.amount) - Number(r.paid_amount || 0),
    })),
  };
}

async function markPaymentReceived(admin: Admin, scope: CallerScope, userId: string, args: any) {
  if (!scope.canRecordPayments) {
    throw new Error("This account doesn't have permission to record payments.");
  }
  if (args?.confirmed !== true) {
    throw new Error("confirmed must be true — only call this after the user has explicitly confirmed the match and amount.");
  }
  const paymentId = String(args?.payment_id ?? "");
  const grossSettled = Number(args?.gross_rent_settled);
  const paidDate = String(args?.paid_date ?? "");
  if (!paymentId) throw new Error("payment_id is required");
  if (!grossSettled || grossSettled <= 0) throw new Error("gross_rent_settled must be greater than 0");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidDate)) throw new Error("paid_date is required as YYYY-MM-DD");

  let q = admin
    .from("rent_payments")
    .select("id, property_id, tenant_id, due_date, amount, paid_amount, workspace_id")
    .eq("id", paymentId)
    .eq("workspace_id", scope.workspaceId!);
  if (scope.propertyIds) q = q.in("property_id", scope.propertyIds);
  const { data: payment, error: fetchError } = await q.maybeSingle();
  if (fetchError) throw fetchError;
  if (!payment) throw new Error("No such payment in your scope. Re-check with find_matching_payment or list_due_payments_for_month.");

  const remaining = Number(payment.amount) - Number(payment.paid_amount || 0);
  if (grossSettled > remaining + 0.01) {
    throw new Error(`gross_rent_settled (${grossSettled}) exceeds the remaining due (${remaining}). Ask the user to confirm the right amount.`);
  }

  const tdsApplicable = !!args?.tds_applicable;
  const tdsAmount = tdsApplicable ? Number(args?.tds_amount) || 0 : 0;
  const gstApplicable = !!args?.gst_applicable;
  const gstAmount = gstApplicable ? Number(args?.gst_amount) || 0 : 0;
  const paymentMethod = args?.payment_method || "bank_transfer";
  const notes = args?.notes || undefined;

  // Guard against the same bank message being pasted (and confirmed) twice — same
  // rent_payment, same date, same rent amount recorded in the last 15 minutes.
  if (!args?.force) {
    const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: recent } = await admin
      .from("payment_transactions")
      .select("id, amount, paid_date, created_at")
      .eq("rent_payment_id", paymentId)
      .eq("paid_date", paidDate)
      .eq("amount", grossSettled)
      .gte("created_at", cutoff);
    if (recent && recent.length > 0) {
      return {
        duplicate_warning: true,
        message: "A very similar payment (same amount and date) was already recorded against this rent payment in the last 15 minutes. Ask the user whether to record it anyway before retrying with force:true.",
        existing_transaction: recent[0],
      };
    }
  }

  const receivedAmount = grossSettled + gstAmount - tdsAmount;
  const { error: txnError } = await admin.from("payment_transactions").insert({
    rent_payment_id: paymentId,
    amount: grossSettled,
    tds_amount: tdsAmount,
    gst_amount: gstAmount,
    received_amount: receivedAmount,
    paid_date: paidDate,
    payment_method: paymentMethod,
    notes,
    workspace_id: scope.workspaceId!,
    created_by: userId,
  });
  if (txnError) throw txnError;

  const newPaidAmount = Number(payment.paid_amount || 0) + grossSettled;
  const newStatus = newPaidAmount >= Number(payment.amount) ? "paid" : "partial";

  const { error: updateError } = await admin
    .from("rent_payments")
    .update({
      paid_amount: newPaidAmount,
      status: newStatus,
      paid_date: paidDate,
      payment_method: paymentMethod,
      notes,
      tds_applicable: tdsApplicable,
      tds_amount: tdsAmount,
      gst_applicable: gstApplicable,
      gst_amount: gstAmount,
      marked_by: userId,
    })
    .eq("id", paymentId);
  if (updateError) throw updateError;

  // Best-effort invoice status sync, same natural-key match used throughout the app.
  try {
    await admin
      .from("invoices")
      .update({ status: newStatus === "paid" ? "paid" : "partial" })
      .eq("property_id", payment.property_id)
      .eq("tenant_id", payment.tenant_id)
      .eq("due_date", payment.due_date);
  } catch (syncError) {
    console.error("Failed to sync invoice status:", syncError);
  }

  return {
    success: true,
    payment_id: paymentId,
    gross_rent_settled: grossSettled,
    tds_amount: tdsAmount,
    gst_amount: gstAmount,
    cash_received: receivedAmount,
    new_status: newStatus,
    remaining_after: Number(payment.amount) - newPaidAmount,
  };
}

async function callTool(admin: Admin, scope: CallerScope, userId: string, name: string, args: any) {
  switch (name) {
    case "list_properties":
      return listProperties(admin, scope);
    case "list_tenants":
      return listTenants(admin, scope, args);
    case "get_tenant_rent_status":
      return getTenantRentStatus(admin, scope, args);
    case "list_overdue_payments":
      return listOverduePayments(admin, scope, args);
    case "get_payment_history":
      return getPaymentHistory(admin, scope, args);
    case "find_matching_payment":
      return findMatchingPayment(admin, scope, args);
    case "list_due_payments_for_month":
      return listDuePaymentsForMonth(admin, scope, args);
    case "mark_payment_received":
      return markPaymentReceived(admin, scope, userId, args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// Minimal JSON-RPC 2.0 / MCP "Streamable HTTP" handling (synchronous JSON
// response mode only — no server-initiated SSE stream, no session id; every
// request re-authenticates and re-scopes itself, so none of that is needed).
// ---------------------------------------------------------------------------
const sha256 = async (value: string) => {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

function jsonRpcResult(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}
function jsonRpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (req.method === "GET" || req.method === "DELETE") {
    // No server-initiated notifications and no session lifecycle to tear down —
    // this server is fully stateless, every POST carries its own auth + scope.
    return new Response(JSON.stringify({ error: "Method not supported by this server" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const authHeader = req.headers.get("Authorization") ?? "";
  const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  const rawToken = bearerToken || url.searchParams.get("token") || "";

  let message: any;
  try {
    message = await req.json();
  } catch {
    return new Response(JSON.stringify(jsonRpcError(null, -32700, "Parse error")), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const id = message?.id ?? null;
  const method = message?.method;
  const params = message?.params ?? {};

  // Notifications (no id) never get a body back.
  const isNotification = message?.id === undefined;

  try {
    if (method === "initialize") {
      const result = {
        protocolVersion: params?.protocolVersion || "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions: SERVER_INSTRUCTIONS,
      };
      return json(jsonRpcResult(id, result));
    }

    if (method === "notifications/initialized" || isNotification) {
      return new Response(null, { status: 202, headers: corsHeaders });
    }

    if (method === "ping") {
      return json(jsonRpcResult(id, {}));
    }

    if (method === "tools/list") {
      return json(jsonRpcResult(id, { tools: TOOLS }));
    }

    if (method === "tools/call") {
      if (!rawToken) {
        return json(jsonRpcResult(id, {
          content: [{ type: "text", text: "Unauthorized: no access token provided." }],
          isError: true,
        }));
      }

      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

      const tokenHash = await sha256(rawToken);
      const { data: tokenRow, error: tokenErr } = await admin
        .from("mcp_api_tokens")
        .select("id, user_id")
        .eq("token_hash", tokenHash)
        .is("revoked_at", null)
        .maybeSingle();

      if (tokenErr || !tokenRow) {
        return json(jsonRpcResult(id, {
          content: [{ type: "text", text: "Unauthorized: invalid or revoked access token." }],
          isError: true,
        }));
      }

      // Awaited (rather than fire-and-forget) since an edge function's execution context can
      // be torn down as soon as the response is sent, which would otherwise sometimes drop
      // this update silently.
      await admin.from("mcp_api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tokenRow.id);

      const scope = await resolveCallerScope(admin, tokenRow.user_id as string);
      if (!scope.workspaceId) {
        return json(jsonRpcResult(id, {
          content: [{ type: "text", text: "This account has no workspace." }],
          isError: true,
        }));
      }

      const toolName = params?.name;
      const toolArgs = params?.arguments ?? {};
      try {
        const toolResult = await callTool(admin, scope, tokenRow.user_id as string, toolName, toolArgs);
        return json(jsonRpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(toolResult, null, 2) }],
        }));
      } catch (err) {
        return json(jsonRpcResult(id, {
          content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
          isError: true,
        }));
      }
    }

    // Any other method (resources/list, prompts/list, etc.) — this server only offers tools.
    return json(jsonRpcError(id, -32601, `Method not found: ${method}`));
  } catch (err) {
    return json(jsonRpcError(id, -32603, (err as Error).message ?? "Internal error"));
  }
});

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

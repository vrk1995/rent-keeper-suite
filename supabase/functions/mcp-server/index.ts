import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveCallerScope, CallerScope } from "../_shared/callerScope.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, mcp-protocol-version",
};

const SERVER_NAME = "rent-keeper-suite";
const SERVER_VERSION = "1.0.0";

// ---------------------------------------------------------------------------
// Tool schemas — read-only by design. None of these can create, edit, or
// delete anything; they only ever run SELECT queries scoped to the caller's
// own workspace and property access (see resolveCallerScope).
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

async function callTool(admin: Admin, scope: CallerScope, name: string, args: any) {
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
        const toolResult = await callTool(admin, scope, toolName, toolArgs);
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

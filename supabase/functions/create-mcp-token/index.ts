import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const sha256 = async (value: string) => {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const generateToken = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "rks_" + Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: roles } = await admin
      .from("user_roles")
      .select("workspace_id, created_at")
      .eq("user_id", userData.user.id)
      .order("created_at", { ascending: true });
    const workspaceId = (roles ?? [])[0]?.workspace_id;
    if (!workspaceId) {
      return new Response(JSON.stringify({ error: "No workspace found for this account" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const name: string = (body?.name ?? "Claude").toString().trim().slice(0, 60) || "Claude";

    const rawToken = generateToken();
    const tokenHash = await sha256(rawToken);

    const { data: inserted, error: insertErr } = await admin
      .from("mcp_api_tokens")
      .insert({ user_id: userData.user.id, workspace_id: workspaceId, token_hash: tokenHash, name })
      .select("id, name, created_at")
      .single();
    if (insertErr) throw insertErr;

    return new Response(
      JSON.stringify({
        success: true,
        token: rawToken,
        id: inserted.id,
        name: inserted.name,
        created_at: inserted.created_at,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

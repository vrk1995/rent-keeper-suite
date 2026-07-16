// deno-lint-ignore-file
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AppRole = "admin" | "member" | "viewer";
const APP_REDIRECT_TO = "https://terntripsindia.in/";
const INVITE_LINK_EXPIRY_DAYS = 14;

const sha256 = async (value: string) => {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const generateToken = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
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

    const { data: callerProfile } = await admin
      .from("profiles")
      .select("full_name")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    const invitedByName =
      callerProfile?.full_name ||
      (userData.user.user_metadata as Record<string, string> | null)?.full_name ||
      userData.user.email ||
      "Your admin";

    // Verify caller is admin or super_admin AND capture their workspace
    const { data: callerRoles } = await admin
      .from("user_roles")
      .select("role, workspace_id, created_at")
      .eq("user_id", userData.user.id)
      .order("created_at", { ascending: true });

    const allowed = (callerRoles ?? []).some(
      (r: any) => r.role === "admin" || r.role === "super_admin"
    );
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerWorkspaceId = (callerRoles ?? [])[0]?.workspace_id;
    if (!callerWorkspaceId) {
      return new Response(JSON.stringify({ error: "No workspace found for inviter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const email: string = (body.email ?? "").trim().toLowerCase();
    const role: AppRole = body.role ?? "member";
    const fullName: string | undefined = body.full_name?.trim();
    const requestedPropertyIds: string[] = Array.isArray(body.property_ids) ? body.property_ids : [];
    if (!email || !["admin", "member", "viewer"].includes(role)) {
      return new Response(JSON.stringify({ error: "Invalid email or role" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // A property-scoped admin can never grant broader access than their own: any requested
    // properties must be within their scope, and inviting with no explicit selection
    // defaults to their own scope rather than to unrestricted access.
    const { data: callerAccess } = await admin
      .from("user_property_access")
      .select("property_id")
      .eq("user_id", userData.user.id)
      .eq("workspace_id", callerWorkspaceId);

    const callerScope = (callerAccess ?? []).map((r: any) => r.property_id as string);
    let invitePropertyIds: string[] | null = requestedPropertyIds.length > 0 ? requestedPropertyIds : null;

    if (callerScope.length > 0) {
      const outOfScope = requestedPropertyIds.filter((id) => !callerScope.includes(id));
      if (outOfScope.length > 0) {
        return new Response(
          JSON.stringify({ error: "You can only grant access to properties you have access to" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      invitePropertyIds = requestedPropertyIds.length > 0 ? requestedPropertyIds : callerScope;
    }

    const inviteToken = generateToken();
    const inviteLink = `${APP_REDIRECT_TO}#/invite-signup?invite=${inviteToken}`;
    const expiresAt = new Date(Date.now() + INVITE_LINK_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { error: inviteRecordErr } = await admin.from("team_invites").insert({
      token_hash: await sha256(inviteToken),
      email,
      full_name: fullName || null,
      role,
      invited_by_user_id: userData.user.id,
      invited_by_name: invitedByName,
      expires_at: expiresAt,
      workspace_id: callerWorkspaceId,
      property_ids: invitePropertyIds,
    });

    if (inviteRecordErr) {
      return new Response(JSON.stringify({ error: inviteRecordErr.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: null,
        invited: true,
        setup_email_sent: false,
        invite_link: inviteLink,
        expires_at: expiresAt,
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

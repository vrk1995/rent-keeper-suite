// deno-lint-ignore-file
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AppRole = "admin" | "member" | "viewer";

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

    // Verify caller is admin or super_admin
    const { data: callerRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);

    const allowed = (callerRoles ?? []).some(
      (r: any) => r.role === "admin" || r.role === "super_admin"
    );
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const email: string = (body.email ?? "").trim().toLowerCase();
    const role: AppRole = body.role ?? "member";
    const fullName: string | undefined = body.full_name;

    if (!email || !["admin", "member", "viewer"].includes(role)) {
      return new Response(JSON.stringify({ error: "Invalid email or role" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find existing user by email
    let targetUserId: string | null = null;
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = list?.users?.find((u: any) => (u.email ?? "").toLowerCase() === email);

    if (existing) {
      targetUserId = existing.id;
    } else {
      const redirectTo = body.redirect_to || undefined;
      const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
        data: fullName ? { full_name: fullName } : undefined,
        redirectTo,
      });
      if (inviteErr || !invited?.user) {
        return new Response(
          JSON.stringify({ error: inviteErr?.message ?? "Failed to invite user" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      targetUserId = invited.user.id;
    }

    // Ensure profile exists. Only set full_name when provided so we don't
    // overwrite an existing name with null.
    const profilePayload: Record<string, unknown> = {
      user_id: targetUserId,
      is_approved: true,
    };
    if (fullName && fullName.trim().length > 0) {
      profilePayload.full_name = fullName.trim();
    }
    await admin
      .from("profiles")
      .upsert(profilePayload, { onConflict: "user_id" });

    // Upsert role (replace existing role rows for this user)
    await admin.from("user_roles").delete().eq("user_id", targetUserId);
    const { error: roleErr } = await admin
      .from("user_roles")
      .insert({ user_id: targetUserId, role });

    if (roleErr) {
      return new Response(JSON.stringify({ error: roleErr.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, user_id: targetUserId, invited: !existing }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// deno-lint-ignore-file
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const token = body?.token?.trim();
    const password = body?.password ?? "";
    const fullName = body?.full_name?.trim() ?? "";

    if (!token || token.length < 32) {
      return new Response(JSON.stringify({ error: "Invalid invite link" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (password.length < 6) {
      return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!fullName) {
      return new Response(JSON.stringify({ error: "Full name is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const tokenHash = await sha256(token);
    const { data: invite, error: inviteErr } = await admin
      .from("team_invites")
      .select("id, email, full_name, role, expires_at, accepted_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (inviteErr) throw inviteErr;
    if (!invite) {
      return new Response(JSON.stringify({ error: "Invite link not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (invite.accepted_at) {
      return new Response(JSON.stringify({ error: "This invite has already been used" }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ error: "This invite has expired" }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const email = invite.email.toLowerCase();
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = list?.users?.find((u: any) => (u.email ?? "").toLowerCase() === email);

    let userId = existing?.id as string | undefined;
    if (userId) {
      const { error } = await admin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
        user_metadata: {
          ...(existing.user_metadata ?? {}),
          full_name: fullName,
        },
      });
      if (error) throw error;
    } else {
      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (error || !created.user) throw error ?? new Error("Could not create user");
      userId = created.user.id;
    }

    await admin.from("profiles").upsert(
      { user_id: userId, full_name: fullName, is_approved: true },
      { onConflict: "user_id" },
    );

    await admin.from("user_roles").delete().eq("user_id", userId);
    const { error: roleErr } = await admin
      .from("user_roles")
      .insert({ user_id: userId, role: invite.role });
    if (roleErr) throw roleErr;

    await admin.from("team_invites").update({ accepted_at: new Date().toISOString() }).eq("id", invite.id);

    return new Response(JSON.stringify({ success: true, email }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
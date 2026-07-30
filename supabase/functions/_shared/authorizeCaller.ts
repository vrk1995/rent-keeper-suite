import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const unauthorized = () =>
  new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const forbidden = () =>
  new Response(JSON.stringify({ error: "Forbidden" }), {
    status: 403,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

/**
 * These document-generation functions run under the service-role key, which bypasses RLS
 * entirely — so unlike an ordinary table query, nothing stops them from being asked for any
 * other workspace's data unless they check for themselves. This re-applies the same
 * has_property_access() scoping RLS would otherwise enforce.
 *
 * A request signed with the service-role key itself (used by internal cron-triggered calls,
 * e.g. generate-daily-invoices calling generate-invoice-pdf) is treated as already trusted and
 * skips the per-user check. Everything else must present a real user session with access to
 * the given property.
 *
 * Returns a Response to send back immediately if unauthorized, or null if the caller may proceed.
 */
export async function authorizePropertyAccess(
  req: Request,
  supabaseUrl: string,
  supabaseServiceKey: string,
  propertyId: string | null | undefined
): Promise<Response | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const callerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (callerToken === supabaseServiceKey) return null;

  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!anonKey) return unauthorized();

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return unauthorized();

  const { data: allowed, error: accessErr } = await userClient.rpc("has_property_access", {
    _user_id: userData.user.id,
    _property_id: propertyId ?? null,
  });
  if (accessErr || !allowed) return forbidden();

  return null;
}

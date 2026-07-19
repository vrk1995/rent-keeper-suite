import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// India has no daylight savings, so IST is always exactly UTC+5:30.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const formatINR = (n: number): string =>
  `Rs. ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n)}`;

// Everyone in the workspace who can see this property: super admins (always unrestricted),
// anyone with no rows at all in user_property_access (unrestricted by default), and anyone
// explicitly granted this specific property. Mirrors the has_property_access() SQL function
// used for RLS, since this runs under the service role and RLS doesn't apply here.
async function resolveRecipients(
  supabase: ReturnType<typeof createClient>,
  workspaceId: string,
  propertyId: string
): Promise<string[]> {
  const { data: roles } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .eq("workspace_id", workspaceId);
  const allUsers = roles || [];
  const superAdmins = new Set(allUsers.filter((r: any) => r.role === "super_admin").map((r: any) => r.user_id));

  const { data: accessRows } = await supabase
    .from("user_property_access")
    .select("user_id, property_id")
    .eq("workspace_id", workspaceId);
  const scopedUserIds = new Set((accessRows || []).map((r: any) => r.user_id));
  const grantedForProperty = new Set(
    (accessRows || []).filter((r: any) => r.property_id === propertyId).map((r: any) => r.user_id)
  );

  const recipients = new Set<string>();
  for (const r of allUsers) {
    const uid = (r as any).user_id;
    if (superAdmins.has(uid) || !scopedUserIds.has(uid) || grantedForProperty.has(uid)) {
      recipients.add(uid);
    }
  }
  return Array.from(recipients);
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const nowIst = new Date(Date.now() + IST_OFFSET_MS);
    const todayDateStr = `${nowIst.getUTCFullYear()}-${String(nowIst.getUTCMonth() + 1).padStart(2, "0")}-${String(nowIst.getUTCDate()).padStart(2, "0")}`;

    console.log(`Applying due rent increments as of ${todayDateStr} (IST)`);

    // One rule may be applied per run — if a rule is more than one interval overdue (e.g. a
    // missed cron day), it's applied once here and picked up again on the next run rather
    // than compounding multiple increases in a single pass.
    const { data: dueIncrements, error: fetchError } = await supabase
      .from("rent_increments")
      .select(
        `id, tenant_id, increment_type, increment_value, interval_months, is_recurring, next_increment_date,
         tenant:tenants(id, name, monthly_rent, property_id, workspace_id, property:properties(name))`
      )
      .eq("is_active", true)
      .lte("next_increment_date", todayDateStr);

    if (fetchError) throw fetchError;

    const applied: string[] = [];
    const errors: { incrementId: string; message: string }[] = [];

    for (const inc of dueIncrements || []) {
      try {
        const tenant: any = (inc as any).tenant;
        if (!tenant) throw new Error("Tenant not found for increment rule");

        const currentRent = tenant.monthly_rent || 0;
        const newRent =
          inc.increment_type === "percentage"
            ? Math.round(currentRent * (1 + inc.increment_value / 100))
            : currentRent + inc.increment_value;

        const { error: histError } = await supabase.from("rent_increment_history").insert({
          tenant_id: inc.tenant_id,
          previous_rent: currentRent,
          new_rent: newRent,
          increment_type: inc.increment_type,
          increment_value: inc.increment_value,
          effective_date: inc.next_increment_date,
          notes: "Applied automatically",
        });
        if (histError) throw histError;

        const { error: tenantError } = await supabase
          .from("tenants")
          .update({ monthly_rent: newRent })
          .eq("id", inc.tenant_id);
        if (tenantError) throw tenantError;

        if (inc.is_recurring) {
          const nextDate = new Date(inc.next_increment_date);
          nextDate.setMonth(nextDate.getMonth() + (inc.interval_months || 12));
          const { error: ruleError } = await supabase
            .from("rent_increments")
            .update({ next_increment_date: nextDate.toISOString().split("T")[0] })
            .eq("id", inc.id);
          if (ruleError) throw ruleError;
        } else {
          // One-time rule: its job is done, and the increase is permanently recorded in
          // rent_increment_history — nothing further for it to do.
          const { error: deleteError } = await supabase.from("rent_increments").delete().eq("id", inc.id);
          if (deleteError) throw deleteError;
        }

        // Notify everyone with access to this property.
        if (tenant.workspace_id && tenant.property_id) {
          const recipients = await resolveRecipients(supabase, tenant.workspace_id, tenant.property_id);
          const propertyName = tenant.property?.name || "the property";
          if (recipients.length > 0) {
            const { error: reminderError } = await supabase.from("reminders").insert(
              recipients.map((userId) => ({
                user_id: userId,
                property_id: tenant.property_id,
                tenant_id: tenant.id,
                title: `Rent increased for ${tenant.name}`,
                description: `Rent for ${tenant.name} at ${propertyName} increased from ${formatINR(currentRent)} to ${formatINR(newRent)}, effective ${inc.next_increment_date}.`,
                reminder_date: todayDateStr,
                reminder_type: "rent_increment",
                is_completed: false,
              }))
            );
            if (reminderError) console.error("Failed to create rent-increment reminders:", reminderError);
          }
        }

        applied.push(inc.id);
      } catch (err) {
        console.error(`Failed to apply rent increment ${inc.id}:`, err);
        errors.push({ incrementId: inc.id, message: (err as Error).message });
      }
    }

    return new Response(
      JSON.stringify({
        date: todayDateStr,
        rulesChecked: (dueIncrements || []).length,
        applied: applied.length,
        errors,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error) {
    console.error("Error applying due rent increments:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});

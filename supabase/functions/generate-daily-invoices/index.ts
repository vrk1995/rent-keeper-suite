import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// India has no daylight savings, so IST is always exactly UTC+5:30 — shifting the current
// UTC instant by that fixed offset and reading its UTC calendar fields gives "today in IST"
// without needing a timezone database.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// The last calendar day of a 'YYYY-MM' billing month, as an ISO date string.
function lastDayOfBillingMonth(billingMonth: string): string {
  const [y, m] = billingMonth.split("-").map(Number);
  // Date.UTC's month argument is 0-indexed, so passing the 1-indexed billing month here
  // targets the *next* month; day 0 of that rolls back to the last day of the billing month.
  return new Date(Date.UTC(y, m, 0)).toISOString().split("T")[0];
}

// What the tenant's rent actually was during a given billing period — NOT necessarily
// whatever tenant.monthly_rent equals right now. A rent increment can take effect on the
// same day (or before) an invoice for an *earlier* period is generated — e.g. an increment
// effective Aug 1st shouldn't retroactively apply to July's rent just because July's invoice
// happens to be created on Aug 2nd under arrears billing. Resolved from the tenant's own
// increment history, so it's correct regardless of when the invoice actually gets generated.
function resolveEffectiveRent(
  currentMonthlyRent: number,
  history: { previous_rent: number; new_rent: number; effective_date: string }[],
  billingMonth: string
): number {
  if (!history || history.length === 0) return currentMonthlyRent || 0;
  const monthEnd = lastDayOfBillingMonth(billingMonth);
  const applicable = history.filter((h) => h.effective_date <= monthEnd);
  if (applicable.length > 0) {
    applicable.sort((a, b) => (a.effective_date < b.effective_date ? 1 : -1));
    return applicable[0].new_rent;
  }
  // No increment had taken effect yet as of this billing period — use the rent that was in
  // place before the earliest recorded increment.
  const earliest = [...history].sort((a, b) => (a.effective_date < b.effective_date ? -1 : 1))[0];
  return earliest.previous_rent;
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
    const todayYear = nowIst.getUTCFullYear();
    const todayMonth = nowIst.getUTCMonth() + 1; // 1-12
    const todayDay = nowIst.getUTCDate();
    const todayDateStr = `${todayYear}-${String(todayMonth).padStart(2, "0")}-${String(todayDay).padStart(2, "0")}`;

    console.log(`Running daily invoice generation for ${todayDateStr} (IST)`);

    const { data: tenants, error: tenantsError } = await supabase
      .from("tenants")
      .select("id, property_id, unit_id, monthly_rent, rent_due_day, rent_due_month_offset, due_days_after_invoice, workspace_id, property:properties(workspace_id)")
      .eq("status", "active");

    if (tenantsError) throw tenantsError;

    const dueTenants = (tenants || []).filter(
      (t) => Math.min(t.rent_due_day || 1, 28) === todayDay && (t.monthly_rent || 0) > 0
    );

    console.log(`${dueTenants.length} of ${tenants?.length ?? 0} active tenants are invoiced on day ${todayDay}`);

    const generated: string[] = [];
    const errors: { tenantId: string; message: string }[] = [];

    for (const tenant of dueTenants) {
      try {
        // The tenant's offset says which billing period this invoice date belongs to
        // (e.g. "in arrears" = invoice dated the month AFTER the rent period), so reverse
        // it against today's month to find that period.
        const offset = tenant.rent_due_month_offset ?? 0;
        let billingMonthNum = todayMonth - offset;
        let billingYear = todayYear;
        if (billingMonthNum < 1) { billingMonthNum += 12; billingYear -= 1; }
        if (billingMonthNum > 12) { billingMonthNum -= 12; billingYear += 1; }
        const billingMonth = `${billingYear}-${String(billingMonthNum).padStart(2, "0")}`;

        const dueDaysAfterInvoice = tenant.due_days_after_invoice ?? 0;
        const dueDateObj = new Date(Date.UTC(todayYear, todayMonth - 1, todayDay));
        dueDateObj.setUTCDate(dueDateObj.getUTCDate() + dueDaysAfterInvoice);
        const dueDateStr = dueDateObj.toISOString().split("T")[0];

        // Find (or create) this billing period's payment record.
        const { data: existingPayment, error: findError } = await supabase
          .from("rent_payments")
          .select("id")
          .eq("tenant_id", tenant.id)
          .eq("billing_month", billingMonth)
          .maybeSingle();

        if (findError) throw findError;

        let paymentId: string;

        if (existingPayment) {
          paymentId = existingPayment.id;
        } else {
          const { data: rentHistory } = await supabase
            .from("rent_increment_history")
            .select("previous_rent, new_rent, effective_date")
            .eq("tenant_id", tenant.id);
          const billingAmount = resolveEffectiveRent(tenant.monthly_rent || 0, rentHistory || [], billingMonth);

          // This runs under the service role, so the workspace_id column default
          // (current_workspace_id()) resolves to NULL — carry the tenant's workspace
          // explicitly, falling back to the property's.
          const workspaceId =
            (tenant as any).workspace_id ?? (tenant as any).property?.workspace_id ?? null;
          if (!workspaceId) throw new Error("Could not resolve workspace for tenant");

          const { data: newPayment, error: insertError } = await supabase
            .from("rent_payments")
            .insert({
              tenant_id: tenant.id,
              property_id: tenant.property_id,
              unit_id: tenant.unit_id,
              amount: billingAmount,
              due_date: dueDateStr,
              invoice_date: todayDateStr,
              billing_month: billingMonth,
              workspace_id: workspaceId,
              status: new Date(dueDateStr) < new Date(todayDateStr) ? "overdue" : "pending",
            })
            .select("id")
            .single();

          if (insertError) throw insertError;
          paymentId = newPayment.id;
        }

        // Reuse generate-invoice-pdf's own create-if-needed + freeze logic rather than
        // duplicating it here — this call's PDF response is discarded, we only care that
        // it leaves behind an invoice row for this payment.
        const invoiceResp = await fetch(`${supabaseUrl}/functions/v1/generate-invoice-pdf`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseServiceKey}`,
            apikey: supabaseServiceKey,
          },
          body: JSON.stringify({ paymentId }),
        });

        if (!invoiceResp.ok) {
          const errText = await invoiceResp.text();
          throw new Error(`generate-invoice-pdf failed: ${errText}`);
        }

        generated.push(paymentId);
      } catch (err) {
        console.error(`Failed to generate invoice for tenant ${tenant.id}:`, err);
        errors.push({ tenantId: tenant.id, message: (err as Error).message });
      }
    }

    return new Response(
      JSON.stringify({
        date: todayDateStr,
        tenantsChecked: dueTenants.length,
        invoicesGenerated: generated.length,
        errors,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error) {
    console.error("Error in daily invoice generation:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});

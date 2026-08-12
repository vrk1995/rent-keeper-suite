import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Manually replicates has_property_access()'s scoping rule for callers that operate under the
 * service-role key (which bypasses RLS, so nothing else stops a query from reaching another
 * user's data). Same rule as RLS: no rows in user_property_access = unrestricted; otherwise
 * limited to exactly the granted properties. Super admins are always unrestricted.
 *
 * Mirrors the equivalent inline logic in apply-due-rent-increments' resolveRecipients().
 */
export interface CallerScope {
  workspaceId: string | null;
  /** null = unrestricted (sees the whole workspace) */
  propertyIds: string[] | null;
  /** Mirrors can_record_payments() — true for super_admin/admin/member, false for viewer
   *  (or any account with no role at all). Gates write tools; read tools ignore it. */
  canRecordPayments: boolean;
}

export async function resolveCallerScope(
  admin: ReturnType<typeof createClient>,
  userId: string
): Promise<CallerScope> {
  const { data: roles } = await admin
    .from("user_roles")
    .select("role, workspace_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  const workspaceId = (roles as any[] ?? [])[0]?.workspace_id ?? null;
  if (!workspaceId) return { workspaceId: null, propertyIds: [], canRecordPayments: false };

  const rolesInWorkspace = (roles as any[] ?? []).filter((r) => r.workspace_id === workspaceId);
  const isSuperAdmin = rolesInWorkspace.some((r) => r.role === "super_admin");
  const canRecordPayments = rolesInWorkspace.some((r) =>
    ["super_admin", "admin", "member"].includes(r.role)
  );
  if (isSuperAdmin) return { workspaceId, propertyIds: null, canRecordPayments };

  const { data: access } = await admin
    .from("user_property_access")
    .select("property_id")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId);

  const scoped = (access as any[] ?? []).map((r) => r.property_id as string);
  return { workspaceId, propertyIds: scoped.length > 0 ? scoped : null, canRecordPayments };
}

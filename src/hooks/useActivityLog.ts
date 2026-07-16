import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ActivityEntityType = "tenants" | "properties" | "rent_payments" | "invoices" | "payment_transactions";

export interface ActivityLogEntry {
  id: string;
  entity_type: string;
  entity_id: string;
  action: "insert" | "update" | "delete";
  changed_by: string | null;
  changed_by_name: string | null;
  changes: Record<string, { old: unknown; new: unknown } | unknown>;
  created_at: string;
}

/** Full edit history for one entity — who changed what field from what to what, and when. */
export const useActivityLog = (entityType: ActivityEntityType, entityId?: string) => {
  return useQuery({
    queryKey: ["activity-log", entityType, entityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_log")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId!)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as unknown as ActivityLogEntry[];
    },
    enabled: !!entityId,
  });
};

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface InvoiceGenerationLogEntry {
  id: string;
  invoice_id: string | null;
  rent_payment_id: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  source: "cron" | "preview" | "manual";
  outcome: "created" | "reused" | "blocked" | "failed";
  reason: string | null;
  triggered_by_name: string | null;
  created_at: string;
}

export const sourceLabel: Record<string, string> = {
  cron: "Scheduled job",
  preview: "Preview",
  manual: "Manual action",
};

export const outcomeLabel: Record<string, string> = {
  created: "Invoice created",
  reused: "Existing invoice re-opened",
  blocked: "Blocked (not due yet)",
  failed: "Failed",
};

/** Audit trail of every attempt to generate an invoice for a given rent record. */
export const useInvoiceGenerationLog = (rentPaymentId?: string | null) =>
  useQuery({
    queryKey: ["invoice-generation-log", rentPaymentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_generation_log")
        .select("*")
        .eq("rent_payment_id", rentPaymentId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as InvoiceGenerationLogEntry[];
    },
    enabled: !!rentPaymentId,
  });

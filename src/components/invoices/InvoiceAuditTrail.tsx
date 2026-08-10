import { Loader2, History } from "lucide-react";
import {
  useInvoiceGenerationLog,
  sourceLabel,
  outcomeLabel,
} from "@/hooks/useInvoiceGenerationLog";
import { formatIST } from "@/lib/dateFormat";

/** Shows why and by whom an invoice was generated for a given rent record. */
export const InvoiceAuditTrail = ({ rentPaymentId }: { rentPaymentId?: string | null }) => {
  const { data: entries, isLoading } = useInvoiceGenerationLog(rentPaymentId);

  if (isLoading) {
    return (
      <div className="py-3 flex justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return <p className="text-xs text-muted-foreground py-2">No generation history recorded yet.</p>;
  }

  return (
    <div className="space-y-1.5 py-1">
      {entries.map((e) => (
        <div key={e.id} className="flex items-start justify-between gap-3 text-xs">
          <span className="flex items-start gap-1.5">
            <History className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
            <span>
              <span className="font-medium text-foreground">
                {outcomeLabel[e.outcome] || e.outcome}
              </span>{" "}
              via {sourceLabel[e.source] || e.source}
              {e.triggered_by_name ? ` by ${e.triggered_by_name}` : ""}
              {e.invoice_number ? ` — ${e.invoice_number}` : ""}
              {e.reason ? <span className="block text-muted-foreground">{e.reason}</span> : null}
            </span>
          </span>
          <span className="text-muted-foreground shrink-0">{formatIST(e.created_at)}</span>
        </div>
      ))}
    </div>
  );
};

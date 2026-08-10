import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { base64ToPdfBlobUrl } from "@/lib/pdfUtils";

export interface PdfPreviewState {
  url: string;
  title: string;
  fileName: string;
  documentType: "invoice" | "receipt";
  paymentId: string;
  /** Only set for invoice previews, once the underlying invoice row has been resolved. */
  invoiceId?: string;
  /** Extra params sent to the edge function (e.g. a specific transactionId, or statement mode). */
  extra?: Record<string, unknown>;
}

/** Generates invoice/receipt PDFs and shows them in an in-app preview instead of a new tab. */
export function usePdfPreview() {
  const [preview, setPreview] = useState<PdfPreviewState | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const generate = async (
    fn: "generate-invoice-pdf" | "generate-receipt-pdf",
    paymentId: string,
    title: string,
    fallbackFileName: string,
    documentType: "invoice" | "receipt",
    extra?: Record<string, unknown>
  ) => {
    setLoadingId(paymentId);
    try {
      const { data, error } = await supabase.functions.invoke(fn, {
        body: { paymentId, ...extra },
      });
      if (error) throw error;
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return {
          url: base64ToPdfBlobUrl(data.pdf),
          title,
          fileName: data.filename || fallbackFileName,
          documentType,
          paymentId,
          extra,
        };
      });

      if (documentType === "invoice") {
        // Invoices aren't linked to payments by FK, so resolve the row the same way the
        // rest of the app matches them: property + tenant + due date + amount. This lets
        // the preview offer an Edit action once the invoice is found.
        const { data: payment } = await supabase
          .from("rent_payments")
          .select("property_id, tenant_id, due_date, amount")
          .eq("id", paymentId)
          .maybeSingle();
        if (payment) {
          const { data: invoice } = await supabase
            .from("invoices")
            .select("id")
            .eq("property_id", payment.property_id)
            .eq("tenant_id", payment.tenant_id)
            .eq("due_date", payment.due_date)
            .eq("amount", payment.amount)
            .maybeSingle();
          if (invoice) {
            setPreview((prev) => (prev ? { ...prev, invoiceId: invoice.id } : prev));
          }
        }
      }
    } finally {
      setLoadingId(null);
    }
  };

  /** `source` is recorded in the invoice audit log: a passive preview vs. a deliberate action. */
  const openInvoice = (paymentId: string, source: "preview" | "manual" = "preview") =>
    generate("generate-invoice-pdf", paymentId, "Invoice", "Invoice.pdf", "invoice", { source });

  /** Receipt for a single installment (transactionId), or the whole payment when omitted. */
  const openReceipt = (paymentId: string, transactionId?: string) =>
    generate(
      "generate-receipt-pdf",
      paymentId,
      "Receipt",
      "Receipt.pdf",
      "receipt",
      transactionId ? { transactionId } : undefined
    );

  /** Combined statement listing every installment against this month's rent with a balance. */
  const openStatement = (paymentId: string) =>
    generate("generate-receipt-pdf", paymentId, "Payment Statement", "Statement.pdf", "receipt", {
      statement: true,
    });

  /** Re-runs whatever generated the current preview — used after an edit is saved, so the
   *  visible PDF reflects the new data instead of the stale blob from before the edit. */
  const refreshPreview = () => {
    if (!preview) return Promise.resolve();
    return preview.documentType === "invoice"
      ? openInvoice(preview.paymentId)
      : generate(
          "generate-receipt-pdf",
          preview.paymentId,
          preview.title,
          preview.fileName,
          "receipt",
          preview.extra
        );
  };

  const closePreview = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  return { preview, loadingId, openInvoice, openReceipt, openStatement, refreshPreview, closePreview };
}

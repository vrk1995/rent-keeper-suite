import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { base64ToPdfBlobUrl } from "@/lib/pdfUtils";

export interface PdfPreviewState {
  url: string;
  title: string;
  fileName: string;
}

/** Generates invoice/receipt PDFs and shows them in an in-app preview instead of a new tab. */
export function usePdfPreview() {
  const [preview, setPreview] = useState<PdfPreviewState | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const generate = async (
    fn: "generate-invoice-pdf" | "generate-receipt-pdf",
    paymentId: string,
    title: string,
    fallbackFileName: string
  ) => {
    setLoadingId(paymentId);
    try {
      const { data, error } = await supabase.functions.invoke(fn, {
        body: { paymentId },
      });
      if (error) throw error;
      setPreview({
        url: base64ToPdfBlobUrl(data.pdf),
        title,
        fileName: data.filename || fallbackFileName,
      });
    } finally {
      setLoadingId(null);
    }
  };

  const openInvoice = (paymentId: string) =>
    generate("generate-invoice-pdf", paymentId, "Invoice", "Invoice.pdf");

  const openReceipt = (paymentId: string) =>
    generate("generate-receipt-pdf", paymentId, "Receipt", "Receipt.pdf");

  const closePreview = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  return { preview, loadingId, openInvoice, openReceipt, closePreview };
}

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Convert a base64-encoded PDF string to a Blob URL and open it in a new tab.
 */
export const openPdfFromBase64 = (base64: string) => {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
};

/**
 * Generate and open an invoice PDF for a given payment ID.
 */
export const generateAndOpenInvoicePdf = async (paymentId: string) => {
  const { data, error } = await supabase.functions.invoke("generate-invoice-pdf", {
    body: { paymentId },
  });
  if (error) throw error;
  openPdfFromBase64(data.pdf);
  toast.success("Invoice opened!");
};

/**
 * Generate and open a receipt PDF for a given payment ID.
 */
export const generateAndOpenReceiptPdf = async (paymentId: string) => {
  const { data, error } = await supabase.functions.invoke("generate-receipt-pdf", {
    body: { paymentId },
  });
  if (error) throw error;
  openPdfFromBase64(data.pdf);
  toast.success("Receipt opened!");
};

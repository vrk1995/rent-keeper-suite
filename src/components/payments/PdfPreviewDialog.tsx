import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Pencil } from "lucide-react";
import { PdfPreviewState } from "@/hooks/usePdfPreview";
import { useIsAdmin } from "@/hooks/useUserRole";
import { EditPaymentDialog } from "@/components/payments/EditPaymentDialog";

interface PdfPreviewDialogProps {
  preview: PdfPreviewState | null;
  onClose: () => void;
  /** Re-generates the currently shown PDF — passed through to the Edit dialog so a saved
   *  edit is immediately visible instead of leaving the stale pre-edit PDF on screen. */
  onRefresh?: () => Promise<void>;
}

export function PdfPreviewDialog({ preview, onClose, onRefresh }: PdfPreviewDialogProps) {
  const { isAdmin } = useIsAdmin();
  const [editOpen, setEditOpen] = useState(false);

  const handleDownload = async () => {
    if (!preview) return;

    // iOS Safari (and the installed home-screen app) doesn't honor the `download` attribute
    // for blob: URLs — clicking the anchor silently does nothing. Use the native share sheet
    // (which supports "Save to Files") there instead, falling back to the anchor everywhere
    // the Web Share API either isn't available or can't share files.
    try {
      const blob = await (await fetch(preview.url)).blob();
      const file = new File([blob], preview.fileName, { type: "application/pdf" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: preview.title });
        return;
      }
    } catch (err) {
      // AbortError fires when the user just dismisses the share sheet — not a real failure.
      if ((err as Error)?.name === "AbortError") return;
    }

    const a = document.createElement("a");
    a.href = preview.url;
    a.download = preview.fileName;
    a.click();
  };

  const canEdit =
    isAdmin &&
    !!preview?.paymentId &&
    (preview.documentType === "receipt" || !!preview.invoiceId);

  return (
    <>
      <Dialog open={!!preview} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="p-0 gap-0 sm:max-w-3xl w-[calc(100%-2rem)] h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader className="flex-row items-center justify-between gap-3 p-4 pr-12 border-b space-y-0">
            <DialogTitle className="text-base truncate">{preview?.title}</DialogTitle>
            <div className="flex items-center gap-2 shrink-0">
              {canEdit && (
                <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              )}
              <Button size="sm" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-1" />
                Download
              </Button>
            </div>
          </DialogHeader>
          <div className="flex-1 bg-muted/30 overflow-hidden">
            {preview && (
              <iframe src={preview.url} title={preview.title} className="w-full h-full border-0" />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <EditPaymentDialog
        paymentId={preview?.paymentId ?? null}
        invoiceId={preview?.invoiceId ?? null}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={onRefresh}
      />
    </>
  );
}

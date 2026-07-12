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
}

export function PdfPreviewDialog({ preview, onClose }: PdfPreviewDialogProps) {
  const { isAdmin } = useIsAdmin();
  const [editOpen, setEditOpen] = useState(false);

  const handleDownload = () => {
    if (!preview) return;
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
      />
    </>
  );
}

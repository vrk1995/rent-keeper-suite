import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { PdfPreviewState } from "@/hooks/usePdfPreview";

interface PdfPreviewDialogProps {
  preview: PdfPreviewState | null;
  onClose: () => void;
}

export function PdfPreviewDialog({ preview, onClose }: PdfPreviewDialogProps) {
  const handleDownload = () => {
    if (!preview) return;
    const a = document.createElement("a");
    a.href = preview.url;
    a.download = preview.fileName;
    a.click();
  };

  return (
    <Dialog open={!!preview} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="p-0 gap-0 sm:max-w-3xl w-[calc(100%-2rem)] h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-row items-center justify-between gap-3 p-4 pr-12 border-b space-y-0">
          <DialogTitle className="text-base truncate">{preview?.title}</DialogTitle>
          <Button size="sm" onClick={handleDownload} className="shrink-0">
            <Download className="h-4 w-4 mr-1" />
            Download
          </Button>
        </DialogHeader>
        <div className="flex-1 bg-muted/30 overflow-hidden">
          {preview && (
            <iframe src={preview.url} title={preview.title} className="w-full h-full border-0" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

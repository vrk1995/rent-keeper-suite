import { useRef, useState } from "react";
import { Upload, FileText, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Expense } from "@/hooks/useExpenses";
import {
  ExpenseDocument,
  useExpenseDocuments,
  useUploadExpenseDocument,
  useDeleteExpenseDocument,
  getExpenseDocumentViewUrl,
} from "@/hooks/useExpenseDocuments";
import { useIsAdmin } from "@/hooks/useUserRole";
import { formatIST } from "@/lib/dateFormat";

interface ExpenseDocumentsDialogProps {
  expense: Expense | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const formatFileSize = (bytes: number | null) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export function ExpenseDocumentsDialog({ expense, open, onOpenChange }: ExpenseDocumentsDialogProps) {
  const { isAdmin } = useIsAdmin();
  const { data: documents, isLoading } = useExpenseDocuments(open ? expense?.id : undefined);
  const uploadDocument = useUploadExpenseDocument();
  const deleteDocument = useDeleteExpenseDocument();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExpenseDocument | null>(null);

  const handleFileSelected = async (file: File | undefined) => {
    if (!file || !expense) return;
    try {
      await uploadDocument.mutateAsync({ file, expenseId: expense.id, propertyId: expense.property_id });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleView = async (doc: ExpenseDocument) => {
    setViewingId(doc.id);
    try {
      const url = await getExpenseDocumentViewUrl(doc.file_path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error("Couldn't open document: " + (err as Error).message);
    } finally {
      setViewingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteDocument.mutateAsync({
      id: deleteTarget.id,
      expenseId: deleteTarget.expense_id,
      filePath: deleteTarget.file_path,
    });
    setDeleteTarget(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Documents</DialogTitle>
            <DialogDescription>
              {expense?.title} — visible to everyone with access to this property.
            </DialogDescription>
          </DialogHeader>

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => handleFileSelected(e.target.files?.[0])}
            accept=".pdf,.jpg,.jpeg,.png,.heic,.webp,.doc,.docx,.xls,.xlsx"
          />
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadDocument.isPending}
          >
            {uploadDocument.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            {uploadDocument.isPending ? "Uploading..." : "Upload Document"}
          </Button>

          {isLoading ? (
            <div className="py-6 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !documents || documents.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No documents uploaded yet.
            </p>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{doc.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(doc.file_size)}
                        {doc.file_size ? " · " : ""}
                        {formatIST(doc.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="View document"
                      onClick={() => handleView(doc)}
                      disabled={viewingId === doc.id}
                    >
                      {viewingId === doc.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ExternalLink className="w-4 h-4" />
                      )}
                    </Button>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete document"
                        onClick={() => setDeleteTarget(doc)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.file_name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

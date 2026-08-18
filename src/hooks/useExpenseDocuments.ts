import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ExpenseDocument {
  id: string;
  expense_id: string;
  property_id: string;
  file_path: string;
  file_name: string;
  file_size: number | null;
  content_type: string | null;
  uploaded_by: string;
  created_at: string;
}

const EXPENSE_DOCUMENTS_BUCKET = "expense-documents";

export const useExpenseDocuments = (expenseId: string | undefined) => {
  return useQuery({
    queryKey: ["expense-documents", expenseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_documents")
        .select("*")
        .eq("expense_id", expenseId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ExpenseDocument[];
    },
    enabled: !!expenseId,
  });
};

export const useUploadExpenseDocument = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      file,
      expenseId,
      propertyId,
    }: {
      file: File;
      expenseId: string;
      propertyId: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const ext = file.name.split(".").pop();
      const path = `${propertyId}/${expenseId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext ? `.${ext}` : ""}`;
      const { error: uploadError } = await supabase.storage.from(EXPENSE_DOCUMENTS_BUCKET).upload(path, file);
      if (uploadError) throw uploadError;

      const { data, error } = await supabase
        .from("expense_documents")
        .insert({
          expense_id: expenseId,
          property_id: propertyId,
          file_path: path,
          file_name: file.name,
          file_size: file.size,
          content_type: file.type || null,
          uploaded_by: user.id,
        })
        .select()
        .single();

      if (error) {
        // Row insert failed after the file landed in storage — clean up rather than leave
        // an orphaned file nothing points to.
        await supabase.storage.from(EXPENSE_DOCUMENTS_BUCKET).remove([path]).catch(() => {});
        throw error;
      }
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["expense-documents", variables.expenseId] });
      toast.success("Document uploaded!");
    },
    onError: (error) => {
      toast.error("Failed to upload document: " + error.message);
    },
  });
};

export const useDeleteExpenseDocument = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      expenseId,
      filePath,
    }: {
      id: string;
      expenseId: string;
      filePath: string;
    }) => {
      const { error } = await supabase.from("expense_documents").delete().eq("id", id);
      if (error) throw error;
      // Best-effort: the row is already gone either way.
      await supabase.storage.from(EXPENSE_DOCUMENTS_BUCKET).remove([filePath]).catch((err) =>
        console.error("Failed to delete document file:", err)
      );
      return expenseId;
    },
    onSuccess: (expenseId) => {
      queryClient.invalidateQueries({ queryKey: ["expense-documents", expenseId] });
      toast.success("Document deleted!");
    },
    onError: (error) => {
      toast.error("Failed to delete document: " + error.message);
    },
  });
};

/** Short-lived signed URL for viewing/downloading a document — generated fresh each time
 *  rather than stored, since the bucket is private. */
export async function getExpenseDocumentViewUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(EXPENSE_DOCUMENTS_BUCKET)
    .createSignedUrl(path, 60);
  if (error) throw error;
  return data.signedUrl;
}

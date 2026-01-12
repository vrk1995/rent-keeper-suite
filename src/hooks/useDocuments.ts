import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Document {
  id: string;
  property_id: string | null;
  tenant_id: string | null;
  uploaded_by: string;
  name: string;
  file_url: string;
  document_type: string;
  created_at: string;
  property?: {
    name: string;
  };
  tenant?: {
    name: string;
  };
}

export interface UploadDocumentInput {
  property_id?: string;
  tenant_id?: string;
  name: string;
  file: File;
  document_type?: string;
}

export const useDocuments = () => {
  return useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select(`
          *,
          property:properties(name),
          tenant:tenants(name)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Document[];
    },
  });
};

export const useDocumentsByProperty = (propertyId: string) => {
  return useQuery({
    queryKey: ["documents", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("property_id", propertyId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Document[];
    },
    enabled: !!propertyId,
  });
};

export const useUploadDocument = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UploadDocumentInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Upload file to storage
      const fileExt = input.file.name.split(".").pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(fileName, input.file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("documents")
        .getPublicUrl(fileName);

      // Create document record
      const { data, error } = await supabase
        .from("documents")
        .insert({
          property_id: input.property_id || null,
          tenant_id: input.tenant_id || null,
          uploaded_by: user.id,
          name: input.name,
          file_url: urlData.publicUrl,
          document_type: input.document_type || "other",
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Document uploaded successfully!");
    },
    onError: (error) => {
      toast.error("Failed to upload document: " + error.message);
    },
  });
};

export const useDeleteDocument = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (document: Document) => {
      // Extract file path from URL
      const urlParts = document.file_url.split("/");
      const filePath = urlParts.slice(-2).join("/");

      // Delete from storage
      await supabase.storage.from("documents").remove([filePath]);

      // Delete record
      const { error } = await supabase.from("documents").delete().eq("id", document.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Document deleted!");
    },
    onError: (error) => {
      toast.error("Failed to delete document: " + error.message);
    },
  });
};

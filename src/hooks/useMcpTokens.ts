import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface McpToken {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export const useMcpTokens = () => {
  return useQuery({
    queryKey: ["mcp-tokens"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mcp_api_tokens")
        .select("id, name, created_at, last_used_at, revoked_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as McpToken[];
    },
  });
};

export const useCreateMcpToken = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase.functions.invoke<{
        token: string;
        id: string;
        name: string;
        created_at: string;
        error?: string;
      }>("create-mcp-token", { body: { name } });
      if (error || data?.error) {
        throw new Error(data?.error || error?.message || "Failed to create token");
      }
      return data as { token: string; id: string; name: string; created_at: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mcp-tokens"] });
    },
    onError: (error: Error) => {
      toast.error("Failed to create token: " + error.message);
    },
  });
};

export const useRevokeMcpToken = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("mcp_api_tokens")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mcp-tokens"] });
      toast.success("Token revoked.");
    },
    onError: (error: Error) => {
      toast.error("Failed to revoke token: " + error.message);
    },
  });
};

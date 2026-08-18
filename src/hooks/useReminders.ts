import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Reminder {
  id: string;
  property_id: string | null;
  tenant_id: string | null;
  expense_id: string | null;
  user_id: string;
  title: string;
  description: string | null;
  reminder_date: string;
  reminder_type: string;
  is_completed: boolean;
  created_at: string;
  property?: {
    name: string;
  };
  tenant?: {
    name: string;
  };
}

export interface CreateReminderInput {
  property_id?: string;
  tenant_id?: string;
  title: string;
  description?: string;
  reminder_date: string;
  reminder_type?: string;
}

export const useReminders = () => {
  return useQuery({
    queryKey: ["reminders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reminders")
        .select(`
          *,
          property:properties(name),
          tenant:tenants(name)
        `)
        .order("reminder_date", { ascending: true });

      if (error) throw error;
      return data as Reminder[];
    },
  });
};

export const useUpcomingReminders = () => {
  return useQuery({
    queryKey: ["reminders", "upcoming"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      
      const { data, error } = await supabase
        .from("reminders")
        .select(`
          *,
          property:properties(name),
          tenant:tenants(name)
        `)
        .gte("reminder_date", today)
        .eq("is_completed", false)
        .order("reminder_date", { ascending: true })
        .limit(10);

      if (error) throw error;
      return data as Reminder[];
    },
  });
};

/** Lightweight count for the nav badge — not the full list, just how many need attention. */
export const useIncompleteReminderCount = () => {
  return useQuery({
    queryKey: ["reminders", "incomplete-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("reminders")
        .select("id", { count: "exact", head: true })
        .eq("is_completed", false);

      if (error) throw error;
      return count || 0;
    },
  });
};

export const useCreateReminder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateReminderInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("reminders")
        .insert({
          ...input,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
      toast.success("Reminder created!");
    },
    onError: (error) => {
      toast.error("Failed to create reminder: " + error.message);
    },
  });
};

export const useCompleteReminder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("reminders")
        .update({ is_completed: true })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
      toast.success("Reminder completed!");
    },
    onError: (error) => {
      toast.error("Failed to complete reminder: " + error.message);
    },
  });
};

export const useDeleteReminder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("reminders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
      toast.success("Reminder deleted!");
    },
    onError: (error) => {
      toast.error("Failed to delete reminder: " + error.message);
    },
  });
};

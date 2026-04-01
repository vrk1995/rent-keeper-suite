import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface RentIncrement {
  id: string;
  tenant_id: string;
  increment_type: "percentage" | "fixed";
  increment_value: number;
  interval_months: number;
  next_increment_date: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RentIncrementHistory {
  id: string;
  tenant_id: string;
  previous_rent: number;
  new_rent: number;
  increment_type: string;
  increment_value: number;
  effective_date: string;
  applied_at: string;
  notes: string | null;
  created_at: string;
}

export const useRentIncrements = (tenantId: string) => {
  return useQuery({
    queryKey: ["rent-increments", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rent_increments")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as RentIncrement[];
    },
    enabled: !!tenantId,
  });
};

export const useRentIncrementHistory = (tenantId: string) => {
  return useQuery({
    queryKey: ["rent-increment-history", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rent_increment_history")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("effective_date", { ascending: false });
      if (error) throw error;
      return data as RentIncrementHistory[];
    },
    enabled: !!tenantId,
  });
};

export const useCreateRentIncrement = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<RentIncrement, "id" | "created_at" | "updated_at">) => {
      const { data, error } = await supabase
        .from("rent_increments")
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["rent-increments", variables.tenant_id] });
      toast.success("Rent increment rule added!");
    },
    onError: (error) => toast.error("Failed to add increment: " + error.message),
  });
};

export const useUpdateRentIncrement = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, tenant_id, ...updates }: Partial<RentIncrement> & { id: string; tenant_id: string }) => {
      const { data, error } = await supabase
        .from("rent_increments")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["rent-increments", variables.tenant_id] });
      toast.success("Increment rule updated!");
    },
    onError: (error) => toast.error("Failed to update: " + error.message),
  });
};

export const useDeleteRentIncrement = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, tenantId }: { id: string; tenantId: string }) => {
      const { error } = await supabase.from("rent_increments").delete().eq("id", id);
      if (error) throw error;
      return tenantId;
    },
    onSuccess: (tenantId) => {
      queryClient.invalidateQueries({ queryKey: ["rent-increments", tenantId] });
      toast.success("Increment rule removed!");
    },
    onError: (error) => toast.error("Failed to delete: " + error.message),
  });
};

export const useApplyRentIncrement = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      tenantId,
      currentRent,
      incrementType,
      incrementValue,
      nextIncrementDate,
      intervalMonths,
      incrementId,
      notes,
    }: {
      tenantId: string;
      currentRent: number;
      incrementType: string;
      incrementValue: number;
      nextIncrementDate: string;
      intervalMonths: number;
      incrementId: string;
      notes?: string;
    }) => {
      const newRent =
        incrementType === "percentage"
          ? Math.round(currentRent * (1 + incrementValue / 100))
          : currentRent + incrementValue;

      // Insert history record
      const { error: histError } = await supabase.from("rent_increment_history").insert({
        tenant_id: tenantId,
        previous_rent: currentRent,
        new_rent: newRent,
        increment_type: incrementType,
        increment_value: incrementValue,
        effective_date: nextIncrementDate,
        notes,
      });
      if (histError) throw histError;

      // Update tenant's monthly rent
      const { error: tenantError } = await supabase
        .from("tenants")
        .update({ monthly_rent: newRent })
        .eq("id", tenantId);
      if (tenantError) throw tenantError;

      // Calculate next increment date
      const currentDate = new Date(nextIncrementDate);
      currentDate.setMonth(currentDate.getMonth() + intervalMonths);
      const nextDate = currentDate.toISOString().split("T")[0];

      // Update the increment rule with new next date
      const { error: incError } = await supabase
        .from("rent_increments")
        .update({ next_increment_date: nextDate })
        .eq("id", incrementId);
      if (incError) throw incError;

      return { tenantId, newRent };
    },
    onSuccess: ({ tenantId }) => {
      queryClient.invalidateQueries({ queryKey: ["rent-increments", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["rent-increment-history", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      toast.success("Rent increment applied successfully!");
    },
    onError: (error) => toast.error("Failed to apply increment: " + error.message),
  });
};

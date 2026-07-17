import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Tenant {
  id: string;
  property_id: string;
  unit_id: string | null;
  floor_id: string | null;
  property_owner_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  move_in_date: string;
  lease_start_date: string;
  lease_end_date: string;
  security_deposit: number;
  rented_sqft: number;
  monthly_rent: number;
  rent_due_day: number;
  rent_due_month_offset: number;
  due_days_after_invoice: number;
  requires_gst: boolean;
  tds_applicable: boolean;
  status: string;
  created_at: string;
  updated_at: string;
  // Billing details
  bill_from_name: string | null;
  bill_from_address: string | null;
  bill_from_gstin: string | null;
  bill_from_pan: string | null;
  bill_from_bank_name: string | null;
  bill_from_account_number: string | null;
  bill_from_ifsc: string | null;
  bill_to_name: string | null;
  bill_to_address: string | null;
  bill_to_gstin: string | null;
  bill_to_pan: string | null;
  // Signatory (individual signing the agreement) + agreement-specific lease terms.
  signatory_name: string | null;
  signatory_relation: string | null;
  signatory_age: number | null;
  signatory_occupation: string | null;
  signatory_designation: string | null;
  signatory_aadhaar: string | null;
  permanent_address: string | null;
  purpose_of_use: string | null;
  notice_period_months: number | null;
  lock_in_period_months: number | null;
  rent_escalation_percent: number | null;
  rent_escalation_frequency_years: number | null;
  renewal_terms: string | null;
  minor_maintenance_by: string | null;
  major_maintenance_by: string | null;
  agreement_template: string | null;
  property?: {
    name: string;
    address: string;
    total_sqft: number;
    property_owner_id: string | null;
  };
  unit?: {
    name: string;
    total_sqft: number;
    building?: {
      name: string;
    };
  };
  floor?: {
    floor_name: string;
  };
  property_owner?: {
    id: string;
    name: string;
  } | null;
}

export interface CreateTenantInput {
  property_id: string;
  unit_id?: string;
  floor_id?: string;
  property_owner_id?: string;
  name: string;
  email?: string;
  phone?: string;
  move_in_date: string;
  lease_start_date: string;
  lease_end_date: string;
  security_deposit?: number;
  rented_sqft?: number;
  monthly_rent?: number;
  rent_due_day?: number;
  rent_due_month_offset?: number;
  due_days_after_invoice?: number;
  requires_gst?: boolean;
  tds_applicable?: boolean;
  status?: string;
  // Billing details
  bill_from_name?: string;
  bill_from_address?: string;
  bill_from_gstin?: string;
  bill_from_pan?: string;
  bill_from_bank_name?: string;
  bill_from_account_number?: string;
  bill_from_ifsc?: string;
  bill_to_name?: string;
  bill_to_address?: string;
  bill_to_gstin?: string;
  bill_to_pan?: string;
  signatory_name?: string;
  signatory_relation?: string;
  signatory_age?: number;
  signatory_occupation?: string;
  signatory_designation?: string;
  signatory_aadhaar?: string;
  permanent_address?: string;
  purpose_of_use?: string;
  notice_period_months?: number;
  lock_in_period_months?: number;
  rent_escalation_percent?: number;
  rent_escalation_frequency_years?: number;
  renewal_terms?: string;
  minor_maintenance_by?: string;
  major_maintenance_by?: string;
  agreement_template?: string;
}

export const useTenants = () => {
  return useQuery({
    queryKey: ["tenants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select(`
          *,
          property:properties(name, address, total_sqft, property_owner_id),
          unit:units(name, total_sqft, building:buildings(name)),
          floor:property_floors(floor_name),
          property_owner:property_owners(id, name)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Tenant[];
    },
  });
};

export const useTenantsByProperty = (propertyId: string) => {
  return useQuery({
    queryKey: ["tenants", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .eq("property_id", propertyId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Tenant[];
    },
    enabled: !!propertyId,
  });
};

export const useCreateTenant = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateTenantInput): Promise<Tenant> => {
      const { data, error } = await supabase
        .from("tenants")
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data as Tenant;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      toast.success("Tenant added successfully!");
    },
    onError: (error) => {
      toast.error("Failed to add tenant: " + error.message);
    },
  });
};

export const useUpdateTenant = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Tenant> & { id: string }) => {
      const { data, error } = await supabase
        .from("tenants")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      toast.success("Tenant updated successfully!");
    },
    onError: (error) => {
      toast.error("Failed to update tenant: " + error.message);
    },
  });
};

export const useDeleteTenant = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tenants").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      toast.success("Tenant deleted successfully!");
    },
    onError: (error) => {
      toast.error("Failed to delete tenant: " + error.message);
    },
  });
};

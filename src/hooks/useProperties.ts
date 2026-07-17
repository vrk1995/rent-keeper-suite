import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

// One landlord (lessor/licensor) on a rent agreement. A property can have several — a firm
// plus an individual co-owner, etc. NEVER holds an Aadhaar number: Aadhaar is typed at
// generation time and passed transiently, never persisted (Aadhaar Act / DPDP compliance).
export interface AgreementLandlord {
  party_type: string; // "individual" | "organisation"
  org_type: string; // e.g. "Partnership Firm" (organisation only)
  entity_name: string; // organisation name (organisation only)
  signatory_name: string; // the person who signs
  relation_type: string; // "son" | "daughter" | "wife" | "husband" | ""
  relation_name: string;
  age: string;
  occupation: string;
  designation: string; // organisation only
  address: string;
  gstin: string;
  pan: string;
}

export interface Property {
  id: string;
  owner_id: string;
  property_owner_id: string | null;
  name: string;
  address: string;
  property_type: string;
  monthly_rent: number;
  status: string;
  notes: string | null;
  floors_owned: number;
  total_sqft: number;
  invoice_prefix: string | null;
  // Legal description — for the "Schedule" section of an auto-generated rent agreement.
  survey_number: string | null;
  sub_division_number: string | null;
  village: string | null;
  taluk: string | null;
  district: string | null;
  door_number: string | null;
  boundary_north: string | null;
  boundary_south: string | null;
  boundary_east: string | null;
  boundary_west: string | null;
  undivided_share: string | null;
  building_tax_by: string | null;
  // Stored as JSON in the DB; cast to AgreementLandlord[] where consumed (see the agreement dialog).
  agreement_landlords: Json | null;
  created_at: string;
  updated_at: string;
  property_owner?: {
    id: string;
    name: string;
  } | null;
}

export interface CreatePropertyInput {
  name: string;
  address: string;
  property_type: string;
  monthly_rent?: number;
  status?: string;
  notes?: string;
  floors_owned?: number;
  total_sqft?: number;
  property_owner_id?: string;
  invoice_prefix?: string;
  survey_number?: string;
  sub_division_number?: string;
  village?: string;
  taluk?: string;
  district?: string;
  door_number?: string;
  boundary_north?: string;
  boundary_south?: string;
  boundary_east?: string;
  boundary_west?: string;
  undivided_share?: string;
  building_tax_by?: string;
}

export const useProperties = () => {
  return useQuery({
    queryKey: ["properties"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select(`
          *,
          property_owner:property_owners(id, name)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Property[];
    },
  });
};

export const useCreateProperty = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreatePropertyInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("properties")
        .insert({
          ...input,
          owner_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      toast.success("Property added successfully!");
    },
    onError: (error) => {
      toast.error("Failed to add property: " + error.message);
    },
  });
};

export const useUpdateProperty = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Property> & { id: string }) => {
      const { data, error } = await supabase
        .from("properties")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      toast.success("Property updated successfully!");
    },
    onError: (error) => {
      toast.error("Failed to update property: " + error.message);
    },
  });
};

export const useDeleteProperty = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("properties").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      toast.success("Property deleted successfully!");
    },
    onError: (error) => {
      toast.error("Failed to delete property: " + error.message);
    },
  });
};

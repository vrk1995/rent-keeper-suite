export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      billing_addresses: {
        Row: {
          address: string | null
          created_at: string
          gstin: string | null
          id: string
          is_default: boolean | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          gstin?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          gstin?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      buildings: {
        Row: {
          address: string
          created_at: string
          id: string
          name: string
          notes: string | null
          owner_id: string
          total_floors: number | null
          updated_at: string
        }
        Insert: {
          address: string
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          owner_id: string
          total_floors?: number | null
          updated_at?: string
        }
        Update: {
          address?: string
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          owner_id?: string
          total_floors?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          created_at: string
          document_type: string | null
          file_url: string
          id: string
          name: string
          property_id: string | null
          tenant_id: string | null
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          document_type?: string | null
          file_url: string
          id?: string
          name: string
          property_id?: string | null
          tenant_id?: string | null
          uploaded_by: string
        }
        Update: {
          created_at?: string
          document_type?: string | null
          file_url?: string
          id?: string
          name?: string
          property_id?: string | null
          tenant_id?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_sequences: {
        Row: {
          created_at: string
          id: string
          last_sequence: number
          property_id: string
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          last_sequence?: number
          property_id: string
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          id?: string
          last_sequence?: number
          property_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_sequences_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          due_date: string
          id: string
          invoice_number: string
          items: Json | null
          notes: string | null
          property_id: string
          status: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          due_date: string
          id?: string
          invoice_number: string
          items?: Json | null
          notes?: string | null
          property_id: string
          status?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          due_date?: string
          id?: string
          invoice_number?: string
          items?: Json | null
          notes?: string | null
          property_id?: string
          status?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          is_approved: boolean | null
          role: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_approved?: boolean | null
          role?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_approved?: boolean | null
          role?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          address: string
          created_at: string
          floors_owned: number | null
          id: string
          invoice_prefix: string | null
          monthly_rent: number
          name: string
          notes: string | null
          owner_id: string
          property_owner_id: string | null
          property_type: string | null
          status: string | null
          total_sqft: number | null
          updated_at: string
        }
        Insert: {
          address: string
          created_at?: string
          floors_owned?: number | null
          id?: string
          invoice_prefix?: string | null
          monthly_rent?: number
          name: string
          notes?: string | null
          owner_id: string
          property_owner_id?: string | null
          property_type?: string | null
          status?: string | null
          total_sqft?: number | null
          updated_at?: string
        }
        Update: {
          address?: string
          created_at?: string
          floors_owned?: number | null
          id?: string
          invoice_prefix?: string | null
          monthly_rent?: number
          name?: string
          notes?: string | null
          owner_id?: string
          property_owner_id?: string | null
          property_type?: string | null
          status?: string | null
          total_sqft?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_property_owner_id_fkey"
            columns: ["property_owner_id"]
            isOneToOne: false
            referencedRelation: "property_owners"
            referencedColumns: ["id"]
          },
        ]
      }
      property_expenses: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          created_by: string
          description: string | null
          expense_date: string
          id: string
          payment_method: string | null
          property_id: string
          receipt_url: string | null
          title: string
          updated_at: string
          vendor_contact: string | null
          vendor_name: string | null
        }
        Insert: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          expense_date?: string
          id?: string
          payment_method?: string | null
          property_id: string
          receipt_url?: string | null
          title: string
          updated_at?: string
          vendor_contact?: string | null
          vendor_name?: string | null
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          expense_date?: string
          id?: string
          payment_method?: string | null
          property_id?: string
          receipt_url?: string | null
          title?: string
          updated_at?: string
          vendor_contact?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_expenses_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_floors: {
        Row: {
          created_at: string
          floor_name: string
          floor_sqft: number
          id: string
          notes: string | null
          property_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          floor_name: string
          floor_sqft?: number
          id?: string
          notes?: string | null
          property_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          floor_name?: string
          floor_sqft?: number
          id?: string
          notes?: string | null
          property_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_floors_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_owner_shares: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          property_id: string
          share_percentage: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          property_id: string
          share_percentage: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          property_id?: string
          share_percentage?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_owner_shares_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "property_owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_owner_shares_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_owners: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_completed: boolean | null
          property_id: string | null
          reminder_date: string
          reminder_type: string | null
          tenant_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_completed?: boolean | null
          property_id?: string | null
          reminder_date: string
          reminder_type?: string | null
          tenant_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_completed?: boolean | null
          property_id?: string | null
          reminder_date?: string
          reminder_type?: string | null
          tenant_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rent_increment_history: {
        Row: {
          applied_at: string
          created_at: string
          effective_date: string
          id: string
          increment_type: string
          increment_value: number
          new_rent: number
          notes: string | null
          previous_rent: number
          tenant_id: string
        }
        Insert: {
          applied_at?: string
          created_at?: string
          effective_date: string
          id?: string
          increment_type: string
          increment_value: number
          new_rent: number
          notes?: string | null
          previous_rent: number
          tenant_id: string
        }
        Update: {
          applied_at?: string
          created_at?: string
          effective_date?: string
          id?: string
          increment_type?: string
          increment_value?: number
          new_rent?: number
          notes?: string | null
          previous_rent?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rent_increment_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rent_increments: {
        Row: {
          created_at: string
          id: string
          increment_type: string
          increment_value: number
          interval_months: number
          is_active: boolean
          next_increment_date: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          increment_type?: string
          increment_value?: number
          interval_months?: number
          is_active?: boolean
          next_increment_date: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          increment_type?: string
          increment_value?: number
          interval_months?: number
          is_active?: boolean
          next_increment_date?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rent_increments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rent_payments: {
        Row: {
          amount: number
          billing_month: string | null
          created_at: string
          due_date: string
          id: string
          marked_by: string | null
          notes: string | null
          paid_date: string | null
          payment_method: string | null
          property_id: string
          receipt_url: string | null
          status: string | null
          tenant_id: string
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          billing_month?: string | null
          created_at?: string
          due_date: string
          id?: string
          marked_by?: string | null
          notes?: string | null
          paid_date?: string | null
          payment_method?: string | null
          property_id: string
          receipt_url?: string | null
          status?: string | null
          tenant_id: string
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          billing_month?: string | null
          created_at?: string
          due_date?: string
          id?: string
          marked_by?: string | null
          notes?: string | null
          paid_date?: string | null
          payment_method?: string | null
          property_id?: string
          receipt_url?: string | null
          status?: string | null
          tenant_id?: string
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rent_payments_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rent_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rent_payments_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_owner_shares: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          share_percentage: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          share_percentage: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          share_percentage?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_owner_shares_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "property_owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_owner_shares_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          bill_from_address: string | null
          bill_from_gstin: string | null
          bill_from_name: string | null
          bill_to_address: string | null
          bill_to_gstin: string | null
          bill_to_name: string | null
          created_at: string
          email: string | null
          floor_id: string | null
          id: string
          lease_end_date: string
          lease_start_date: string
          monthly_rent: number | null
          move_in_date: string
          name: string
          phone: string | null
          property_id: string
          property_owner_id: string | null
          rent_due_day: number | null
          rented_sqft: number | null
          requires_gst: boolean | null
          security_deposit: number | null
          status: string | null
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          bill_from_address?: string | null
          bill_from_gstin?: string | null
          bill_from_name?: string | null
          bill_to_address?: string | null
          bill_to_gstin?: string | null
          bill_to_name?: string | null
          created_at?: string
          email?: string | null
          floor_id?: string | null
          id?: string
          lease_end_date: string
          lease_start_date: string
          monthly_rent?: number | null
          move_in_date: string
          name: string
          phone?: string | null
          property_id: string
          property_owner_id?: string | null
          rent_due_day?: number | null
          rented_sqft?: number | null
          requires_gst?: boolean | null
          security_deposit?: number | null
          status?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          bill_from_address?: string | null
          bill_from_gstin?: string | null
          bill_from_name?: string | null
          bill_to_address?: string | null
          bill_to_gstin?: string | null
          bill_to_name?: string | null
          created_at?: string
          email?: string | null
          floor_id?: string | null
          id?: string
          lease_end_date?: string
          lease_start_date?: string
          monthly_rent?: number | null
          move_in_date?: string
          name?: string
          phone?: string | null
          property_id?: string
          property_owner_id?: string | null
          rent_due_day?: number | null
          rented_sqft?: number | null
          requires_gst?: boolean | null
          security_deposit?: number | null
          status?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "property_floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_property_owner_id_fkey"
            columns: ["property_owner_id"]
            isOneToOne: false
            referencedRelation: "property_owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          building_id: string
          created_at: string
          floor_number: number | null
          id: string
          monthly_rent: number
          name: string
          notes: string | null
          property_id: string | null
          status: string | null
          total_sqft: number | null
          unit_type: string
          updated_at: string
        }
        Insert: {
          building_id: string
          created_at?: string
          floor_number?: number | null
          id?: string
          monthly_rent?: number
          name: string
          notes?: string | null
          property_id?: string | null
          status?: string | null
          total_sqft?: number | null
          unit_type?: string
          updated_at?: string
        }
        Update: {
          building_id?: string
          created_at?: string
          floor_number?: number | null
          id?: string
          monthly_rent?: number
          name?: string
          notes?: string | null
          property_id?: string | null
          status?: string | null
          total_sqft?: number | null
          unit_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      daily_payment_processing: { Args: never; Returns: Json }
      generate_monthly_rent_payments: { Args: never; Returns: Json }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_user_approved: { Args: { _user_id: string }; Returns: boolean }
      update_overdue_payments: { Args: never; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "member" | "viewer" | "super_admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "member", "viewer", "super_admin"],
    },
  },
} as const

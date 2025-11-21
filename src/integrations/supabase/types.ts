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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      contract_amendments: {
        Row: {
          amendment_date: string
          amendment_number: number
          changes_summary: string | null
          contract_id: string
          created_at: string
          effective_date: string | null
          id: string
          ocr_data: Json | null
          ocr_processed_at: string | null
          ocr_status: string | null
          pdf_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amendment_date?: string
          amendment_number: number
          changes_summary?: string | null
          contract_id: string
          created_at?: string
          effective_date?: string | null
          id?: string
          ocr_data?: Json | null
          ocr_processed_at?: string | null
          ocr_status?: string | null
          pdf_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amendment_date?: string
          amendment_number?: number
          changes_summary?: string | null
          contract_id?: string
          created_at?: string
          effective_date?: string | null
          id?: string
          ocr_data?: Json | null
          ocr_processed_at?: string | null
          ocr_status?: string | null
          pdf_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_amendments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          addons: Json | null
          billing_frequency: string | null
          company_name: string
          contract_pdf_url: string | null
          contract_status: string | null
          created_at: string
          currency: string | null
          custom_pricing: Json | null
          customer_id: string
          id: string
          initial_mw: number
          minimum_annual_value: number | null
          minimum_charge: number | null
          modules: Json | null
          next_invoice_date: string | null
          notes: string | null
          ocr_data: Json | null
          ocr_processed_at: string | null
          ocr_status: string | null
          package: string
          period_end: string | null
          period_start: string | null
          signed_date: string | null
          updated_at: string
          user_id: string
          volume_discounts: Json | null
        }
        Insert: {
          addons?: Json | null
          billing_frequency?: string | null
          company_name: string
          contract_pdf_url?: string | null
          contract_status?: string | null
          created_at?: string
          currency?: string | null
          custom_pricing?: Json | null
          customer_id: string
          id?: string
          initial_mw: number
          minimum_annual_value?: number | null
          minimum_charge?: number | null
          modules?: Json | null
          next_invoice_date?: string | null
          notes?: string | null
          ocr_data?: Json | null
          ocr_processed_at?: string | null
          ocr_status?: string | null
          package: string
          period_end?: string | null
          period_start?: string | null
          signed_date?: string | null
          updated_at?: string
          user_id: string
          volume_discounts?: Json | null
        }
        Update: {
          addons?: Json | null
          billing_frequency?: string | null
          company_name?: string
          contract_pdf_url?: string | null
          contract_status?: string | null
          created_at?: string
          currency?: string | null
          custom_pricing?: Json | null
          customer_id?: string
          id?: string
          initial_mw?: number
          minimum_annual_value?: number | null
          minimum_charge?: number | null
          modules?: Json | null
          next_invoice_date?: string | null
          notes?: string | null
          ocr_data?: Json | null
          ocr_processed_at?: string | null
          ocr_status?: string | null
          package?: string
          period_end?: string | null
          period_start?: string | null
          signed_date?: string | null
          updated_at?: string
          user_id?: string
          volume_discounts?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      currency_settings: {
        Row: {
          created_at: string
          currency: string | null
          exchange_rate: number | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string | null
          exchange_rate?: number | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string | null
          exchange_rate?: number | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          ammp_asset_ids: Json | null
          ammp_capabilities: Json | null
          ammp_org_id: string | null
          ammp_sync_status: string | null
          created_at: string
          id: string
          join_date: string | null
          last_ammp_sync: string | null
          last_invoiced: string | null
          location: string | null
          manual_status_override: boolean | null
          mwp_managed: number | null
          name: string
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ammp_asset_ids?: Json | null
          ammp_capabilities?: Json | null
          ammp_org_id?: string | null
          ammp_sync_status?: string | null
          created_at?: string
          id?: string
          join_date?: string | null
          last_ammp_sync?: string | null
          last_invoiced?: string | null
          location?: string | null
          manual_status_override?: boolean | null
          mwp_managed?: number | null
          name: string
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ammp_asset_ids?: Json | null
          ammp_capabilities?: Json | null
          ammp_org_id?: string | null
          ammp_sync_status?: string | null
          created_at?: string
          id?: string
          join_date?: string | null
          last_ammp_sync?: string | null
          last_invoiced?: string | null
          location?: string | null
          manual_status_override?: boolean | null
          mwp_managed?: number | null
          name?: string
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          addons_data: Json | null
          billing_frequency: string
          contract_id: string | null
          created_at: string | null
          currency: string | null
          customer_id: string
          id: string
          invoice_amount: number
          invoice_date: string
          modules_data: Json | null
          mw_change: number | null
          mw_managed: number
          total_mw: number
          updated_at: string | null
          user_id: string
          xero_invoice_id: string | null
        }
        Insert: {
          addons_data?: Json | null
          billing_frequency: string
          contract_id?: string | null
          created_at?: string | null
          currency?: string | null
          customer_id: string
          id?: string
          invoice_amount: number
          invoice_date: string
          modules_data?: Json | null
          mw_change?: number | null
          mw_managed: number
          total_mw: number
          updated_at?: string | null
          user_id: string
          xero_invoice_id?: string | null
        }
        Update: {
          addons_data?: Json | null
          billing_frequency?: string
          contract_id?: string | null
          created_at?: string | null
          currency?: string | null
          customer_id?: string
          id?: string
          invoice_amount?: number
          invoice_date?: string
          modules_data?: Json | null
          mw_change?: number | null
          mw_managed?: number
          total_mw?: number
          updated_at?: string | null
          user_id?: string
          xero_invoice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          company?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          company?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      xero_connections: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string
          id: string
          invoice_template: string | null
          is_enabled: boolean | null
          refresh_token: string
          tenant_id: string
          tenant_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: string
          id?: string
          invoice_template?: string | null
          is_enabled?: boolean | null
          refresh_token: string
          tenant_id: string
          tenant_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string
          id?: string
          invoice_template?: string | null
          is_enabled?: boolean | null
          refresh_token?: string
          tenant_id?: string
          tenant_name?: string | null
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "viewer"
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
      app_role: ["admin", "manager", "viewer"],
    },
  },
} as const

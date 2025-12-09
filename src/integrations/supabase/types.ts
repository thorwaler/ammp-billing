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
      ammp_connections: {
        Row: {
          api_key: string
          created_at: string
          id: string
          last_sync_at: string | null
          next_sync_at: string | null
          sync_schedule: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key: string
          created_at?: string
          id?: string
          last_sync_at?: string | null
          next_sync_at?: string | null
          sync_schedule?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key?: string
          created_at?: string
          id?: string
          last_sync_at?: string | null
          next_sync_at?: string | null
          sync_schedule?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ammp_sync_history: {
        Row: {
          asset_breakdown: Json | null
          created_at: string | null
          customer_id: string
          hybrid_mw: number | null
          hybrid_sites: number | null
          id: string
          mw_delta: number | null
          ongrid_mw: number | null
          ongrid_sites: number | null
          previous_total_mw: number | null
          sites_with_solcast: number | null
          synced_at: string | null
          total_mw: number | null
          total_sites: number | null
          user_id: string
        }
        Insert: {
          asset_breakdown?: Json | null
          created_at?: string | null
          customer_id: string
          hybrid_mw?: number | null
          hybrid_sites?: number | null
          id?: string
          mw_delta?: number | null
          ongrid_mw?: number | null
          ongrid_sites?: number | null
          previous_total_mw?: number | null
          sites_with_solcast?: number | null
          synced_at?: string | null
          total_mw?: number | null
          total_sites?: number | null
          user_id: string
        }
        Update: {
          asset_breakdown?: Json | null
          created_at?: string | null
          customer_id?: string
          hybrid_mw?: number | null
          hybrid_sites?: number | null
          id?: string
          mw_delta?: number | null
          ongrid_mw?: number | null
          ongrid_sites?: number | null
          previous_total_mw?: number | null
          sites_with_solcast?: number | null
          synced_at?: string | null
          total_mw?: number | null
          total_sites?: number | null
          user_id?: string
        }
        Relationships: []
      }
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
          above_threshold_price_per_kwp: number | null
          addons: Json | null
          ammp_asset_group_id: string | null
          ammp_asset_group_name: string | null
          annual_fee_per_site: number | null
          base_monthly_price: number | null
          below_threshold_price_per_kwp: number | null
          billing_frequency: string | null
          company_name: string
          contract_ammp_org_id: string | null
          contract_expiry_date: string | null
          contract_name: string | null
          contract_pdf_url: string | null
          contract_status: string | null
          created_at: string
          currency: string | null
          custom_pricing: Json | null
          customer_id: string
          id: string
          initial_mw: number
          manual_invoicing: boolean | null
          max_mw: number | null
          minimum_annual_value: number | null
          minimum_charge: number | null
          minimum_charge_tiers: Json | null
          modules: Json | null
          next_invoice_date: string | null
          notes: string | null
          ocr_data: Json | null
          ocr_processed_at: string | null
          ocr_status: string | null
          onboarding_fee_per_site: number | null
          package: string
          period_end: string | null
          period_start: string | null
          portfolio_discount_tiers: Json | null
          retainer_hourly_rate: number | null
          retainer_hours: number | null
          retainer_minimum_value: number | null
          signed_date: string | null
          site_charge_frequency: string | null
          site_size_threshold_kwp: number | null
          updated_at: string
          user_id: string
          volume_discounts: Json | null
        }
        Insert: {
          above_threshold_price_per_kwp?: number | null
          addons?: Json | null
          ammp_asset_group_id?: string | null
          ammp_asset_group_name?: string | null
          annual_fee_per_site?: number | null
          base_monthly_price?: number | null
          below_threshold_price_per_kwp?: number | null
          billing_frequency?: string | null
          company_name: string
          contract_ammp_org_id?: string | null
          contract_expiry_date?: string | null
          contract_name?: string | null
          contract_pdf_url?: string | null
          contract_status?: string | null
          created_at?: string
          currency?: string | null
          custom_pricing?: Json | null
          customer_id: string
          id?: string
          initial_mw: number
          manual_invoicing?: boolean | null
          max_mw?: number | null
          minimum_annual_value?: number | null
          minimum_charge?: number | null
          minimum_charge_tiers?: Json | null
          modules?: Json | null
          next_invoice_date?: string | null
          notes?: string | null
          ocr_data?: Json | null
          ocr_processed_at?: string | null
          ocr_status?: string | null
          onboarding_fee_per_site?: number | null
          package: string
          period_end?: string | null
          period_start?: string | null
          portfolio_discount_tiers?: Json | null
          retainer_hourly_rate?: number | null
          retainer_hours?: number | null
          retainer_minimum_value?: number | null
          signed_date?: string | null
          site_charge_frequency?: string | null
          site_size_threshold_kwp?: number | null
          updated_at?: string
          user_id: string
          volume_discounts?: Json | null
        }
        Update: {
          above_threshold_price_per_kwp?: number | null
          addons?: Json | null
          ammp_asset_group_id?: string | null
          ammp_asset_group_name?: string | null
          annual_fee_per_site?: number | null
          base_monthly_price?: number | null
          below_threshold_price_per_kwp?: number | null
          billing_frequency?: string | null
          company_name?: string
          contract_ammp_org_id?: string | null
          contract_expiry_date?: string | null
          contract_name?: string | null
          contract_pdf_url?: string | null
          contract_status?: string | null
          created_at?: string
          currency?: string | null
          custom_pricing?: Json | null
          customer_id?: string
          id?: string
          initial_mw?: number
          manual_invoicing?: boolean | null
          max_mw?: number | null
          minimum_annual_value?: number | null
          minimum_charge?: number | null
          minimum_charge_tiers?: Json | null
          modules?: Json | null
          next_invoice_date?: string | null
          notes?: string | null
          ocr_data?: Json | null
          ocr_processed_at?: string | null
          ocr_status?: string | null
          onboarding_fee_per_site?: number | null
          package?: string
          period_end?: string | null
          period_start?: string | null
          portfolio_discount_tiers?: Json | null
          retainer_hourly_rate?: number | null
          retainer_hours?: number | null
          retainer_minimum_value?: number | null
          signed_date?: string | null
          site_charge_frequency?: string | null
          site_size_threshold_kwp?: number | null
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
          nickname: string | null
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
          nickname?: string | null
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
          nickname?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          addons_data: Json | null
          arr_amount: number | null
          arr_amount_eur: number | null
          billing_frequency: string
          contract_id: string | null
          created_at: string | null
          currency: string | null
          customer_id: string
          id: string
          invoice_amount: number
          invoice_amount_eur: number | null
          invoice_date: string
          modules_data: Json | null
          mw_change: number | null
          mw_managed: number
          nrr_amount: number | null
          nrr_amount_eur: number | null
          source: string | null
          support_document_data: Json | null
          total_mw: number
          updated_at: string | null
          user_id: string
          xero_amount_credited: number | null
          xero_amount_credited_eur: number | null
          xero_contact_name: string | null
          xero_invoice_id: string | null
          xero_line_items: Json | null
          xero_reference: string | null
          xero_status: string | null
          xero_synced_at: string | null
        }
        Insert: {
          addons_data?: Json | null
          arr_amount?: number | null
          arr_amount_eur?: number | null
          billing_frequency: string
          contract_id?: string | null
          created_at?: string | null
          currency?: string | null
          customer_id: string
          id?: string
          invoice_amount: number
          invoice_amount_eur?: number | null
          invoice_date: string
          modules_data?: Json | null
          mw_change?: number | null
          mw_managed: number
          nrr_amount?: number | null
          nrr_amount_eur?: number | null
          source?: string | null
          support_document_data?: Json | null
          total_mw: number
          updated_at?: string | null
          user_id: string
          xero_amount_credited?: number | null
          xero_amount_credited_eur?: number | null
          xero_contact_name?: string | null
          xero_invoice_id?: string | null
          xero_line_items?: Json | null
          xero_reference?: string | null
          xero_status?: string | null
          xero_synced_at?: string | null
        }
        Update: {
          addons_data?: Json | null
          arr_amount?: number | null
          arr_amount_eur?: number | null
          billing_frequency?: string
          contract_id?: string | null
          created_at?: string | null
          currency?: string | null
          customer_id?: string
          id?: string
          invoice_amount?: number
          invoice_amount_eur?: number | null
          invoice_date?: string
          modules_data?: Json | null
          mw_change?: number | null
          mw_managed?: number
          nrr_amount?: number | null
          nrr_amount_eur?: number | null
          source?: string | null
          support_document_data?: Json | null
          total_mw?: number
          updated_at?: string | null
          user_id?: string
          xero_amount_credited?: number | null
          xero_amount_credited_eur?: number | null
          xero_contact_name?: string | null
          xero_invoice_id?: string | null
          xero_line_items?: Json | null
          xero_reference?: string | null
          xero_status?: string | null
          xero_synced_at?: string | null
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
      notification_settings: {
        Row: {
          created_at: string
          id: string
          min_severity: string | null
          notification_types: string[] | null
          updated_at: string
          user_id: string
          webhook_enabled: boolean | null
          zapier_webhook_url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          min_severity?: string | null
          notification_types?: string[] | null
          updated_at?: string
          user_id: string
          webhook_enabled?: boolean | null
          zapier_webhook_url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          min_severity?: string | null
          notification_types?: string[] | null
          updated_at?: string
          user_id?: string
          webhook_enabled?: boolean | null
          zapier_webhook_url?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          contract_id: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          metadata: Json | null
          severity: string | null
          title: string
          type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          contract_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          metadata?: Json | null
          severity?: string | null
          title: string
          type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          contract_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          metadata?: Json | null
          severity?: string | null
          title?: string
          type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
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
      revenue_account_mappings: {
        Row: {
          account_code: string
          account_name: string | null
          created_at: string | null
          id: string
          revenue_type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_code: string
          account_name?: string | null
          created_at?: string | null
          id?: string
          revenue_type?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_code?: string
          account_name?: string | null
          created_at?: string | null
          id?: string
          revenue_type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      site_billing_status: {
        Row: {
          asset_capacity_kwp: number | null
          asset_id: string
          asset_name: string
          contract_id: string
          created_at: string | null
          customer_id: string
          id: string
          last_annual_invoice_id: string | null
          last_annual_payment_date: string | null
          next_annual_due_date: string | null
          onboarding_date: string | null
          onboarding_fee_paid: boolean | null
          onboarding_fee_paid_date: string | null
          onboarding_invoice_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          asset_capacity_kwp?: number | null
          asset_id: string
          asset_name: string
          contract_id: string
          created_at?: string | null
          customer_id: string
          id?: string
          last_annual_invoice_id?: string | null
          last_annual_payment_date?: string | null
          next_annual_due_date?: string | null
          onboarding_date?: string | null
          onboarding_fee_paid?: boolean | null
          onboarding_fee_paid_date?: string | null
          onboarding_invoice_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          asset_capacity_kwp?: number | null
          asset_id?: string
          asset_name?: string
          contract_id?: string
          created_at?: string | null
          customer_id?: string
          id?: string
          last_annual_invoice_id?: string | null
          last_annual_payment_date?: string | null
          next_annual_due_date?: string | null
          onboarding_date?: string | null
          onboarding_fee_paid?: boolean | null
          onboarding_fee_paid_date?: string | null
          onboarding_invoice_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_billing_status_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_billing_status_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_billing_status_last_annual_invoice_id_fkey"
            columns: ["last_annual_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_billing_status_onboarding_invoice_id_fkey"
            columns: ["onboarding_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
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
      can_write: { Args: { _user_id: string }; Returns: boolean }
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

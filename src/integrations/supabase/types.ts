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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      alert_settings: {
        Row: {
          asset_manipulation_enabled: boolean
          asset_manipulation_threshold: number
          asset_manipulation_window_days: number
          asset_reappear_suspicious_days: number
          created_at: string
          id: string
          individual_asset_tracking_enabled: boolean
          invoice_increase_critical: number
          invoice_increase_enabled: boolean
          invoice_increase_warning: number
          minimum_asset_mw_for_alert: number
          mw_decrease_enabled: boolean
          mw_decrease_threshold: number
          site_decrease_enabled: boolean
          site_decrease_threshold: number
          updated_at: string
          user_id: string
        }
        Insert: {
          asset_manipulation_enabled?: boolean
          asset_manipulation_threshold?: number
          asset_manipulation_window_days?: number
          asset_reappear_suspicious_days?: number
          created_at?: string
          id?: string
          individual_asset_tracking_enabled?: boolean
          invoice_increase_critical?: number
          invoice_increase_enabled?: boolean
          invoice_increase_warning?: number
          minimum_asset_mw_for_alert?: number
          mw_decrease_enabled?: boolean
          mw_decrease_threshold?: number
          site_decrease_enabled?: boolean
          site_decrease_threshold?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          asset_manipulation_enabled?: boolean
          asset_manipulation_threshold?: number
          asset_manipulation_window_days?: number
          asset_reappear_suspicious_days?: number
          created_at?: string
          id?: string
          individual_asset_tracking_enabled?: boolean
          invoice_increase_critical?: number
          invoice_increase_enabled?: boolean
          invoice_increase_warning?: number
          minimum_asset_mw_for_alert?: number
          mw_decrease_enabled?: boolean
          mw_decrease_threshold?: number
          site_decrease_enabled?: boolean
          site_decrease_threshold?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
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
      ammp_sync_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          current_asset_name: string | null
          customer_id: string
          error_message: string | null
          id: string
          processed_assets: number | null
          result: Json | null
          status: string
          total_assets: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_asset_name?: string | null
          customer_id: string
          error_message?: string | null
          id?: string
          processed_assets?: number | null
          result?: Json | null
          status?: string
          total_assets?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_asset_name?: string | null
          customer_id?: string
          error_message?: string | null
          id?: string
          processed_assets?: number | null
          result?: Json | null
          status?: string
          total_assets?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      asset_status_history: {
        Row: {
          asset_id: string
          asset_name: string
          capacity_mw: number
          contract_id: string
          created_at: string
          customer_id: string
          days_absent: number | null
          detected_at: string
          id: string
          metadata: Json | null
          previous_seen_at: string | null
          status_change: string
          sync_id: string | null
          user_id: string
        }
        Insert: {
          asset_id: string
          asset_name: string
          capacity_mw?: number
          contract_id: string
          created_at?: string
          customer_id: string
          days_absent?: number | null
          detected_at?: string
          id?: string
          metadata?: Json | null
          previous_seen_at?: string | null
          status_change: string
          sync_id?: string | null
          user_id: string
        }
        Update: {
          asset_id?: string
          asset_name?: string
          capacity_mw?: number
          contract_id?: string
          created_at?: string
          customer_id?: string
          days_absent?: number | null
          detected_at?: string
          id?: string
          metadata?: Json | null
          previous_seen_at?: string | null
          status_change?: string
          sync_id?: string | null
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
      contract_types: {
        Row: {
          addons_config: Json | null
          asset_group_scoped: boolean | null
          created_at: string
          default_billing_frequency: string | null
          default_commitment_discount_percent: number | null
          default_currency: string | null
          default_minimum_annual_value: number | null
          default_upfront_discount_percent: number | null
          default_values: Json | null
          description: string | null
          force_billing_frequency: boolean | null
          id: string
          is_active: boolean | null
          modules_config: Json | null
          name: string
          pricing_model: string
          slug: string
          updated_at: string
          user_id: string
          xero_line_items_config: Json | null
        }
        Insert: {
          addons_config?: Json | null
          asset_group_scoped?: boolean | null
          created_at?: string
          default_billing_frequency?: string | null
          default_commitment_discount_percent?: number | null
          default_currency?: string | null
          default_minimum_annual_value?: number | null
          default_upfront_discount_percent?: number | null
          default_values?: Json | null
          description?: string | null
          force_billing_frequency?: boolean | null
          id?: string
          is_active?: boolean | null
          modules_config?: Json | null
          name: string
          pricing_model: string
          slug: string
          updated_at?: string
          user_id: string
          xero_line_items_config?: Json | null
        }
        Update: {
          addons_config?: Json | null
          asset_group_scoped?: boolean | null
          created_at?: string
          default_billing_frequency?: string | null
          default_commitment_discount_percent?: number | null
          default_currency?: string | null
          default_minimum_annual_value?: number | null
          default_upfront_discount_percent?: number | null
          default_values?: Json | null
          description?: string | null
          force_billing_frequency?: boolean | null
          id?: string
          is_active?: boolean | null
          modules_config?: Json | null
          name?: string
          pricing_model?: string
          slug?: string
          updated_at?: string
          user_id?: string
          xero_line_items_config?: Json | null
        }
        Relationships: []
      }
      contracts: {
        Row: {
          above_threshold_price_per_mwp: number | null
          addons: Json | null
          ammp_asset_group_id: string | null
          ammp_asset_group_id_and: string | null
          ammp_asset_group_id_not: string | null
          ammp_asset_group_name: string | null
          ammp_asset_group_name_and: string | null
          ammp_asset_group_name_not: string | null
          ammp_asset_ids: Json | null
          ammp_org_id: string | null
          ammp_sync_status: string | null
          anniversary_notice_days: number
          annual_billing_anchor_date: string | null
          annual_fee_per_site: number | null
          annual_minimum_fee: number | null
          annual_minimum_mode: string
          api_setup_fee: number | null
          base_monthly_price: number | null
          below_threshold_price_per_mwp: number | null
          billing_frequency: string | null
          cached_capabilities: Json | null
          commitment_discount_percent: number | null
          committed_minimum_mw: number | null
          company_name: string
          contract_ammp_org_id: string | null
          contract_expiry_date: string | null
          contract_name: string | null
          contract_pdf_url: string | null
          contract_status: string | null
          contract_type_id: string | null
          created_at: string
          currency: string | null
          custom_asset_pricing: Json | null
          custom_pricing: Json | null
          customer_id: string
          elum_parent_org_id: string | null
          elum_tier: string | null
          first_invoice_date: string | null
          graduated_mw_tiers: Json | null
          hourly_rate: number | null
          id: string
          inflation_cap_enabled: boolean
          initial_mw: number
          invoice_freeze_enabled: boolean
          invoice_lead_days: number
          invoicing_type: string | null
          irradiance_per_site_tiers: Json | null
          is_trial: boolean
          last_ammp_sync: string | null
          last_anniversary_notice_sent_at: string | null
          last_annual_invoice_date: string | null
          max_mw: number | null
          minimum_annual_value: number | null
          minimum_charge: number | null
          minimum_charge_tiers: Json | null
          modules: Json | null
          municipality_count: number | null
          next_invoice_date: string | null
          notes: string | null
          ocr_data: Json | null
          ocr_processed_at: string | null
          ocr_status: string | null
          onboarding_fee_per_site: number | null
          onboarding_setup_fee: number | null
          org_pricing_config: Json
          package: string
          performance_per_mwp_tiers: Json | null
          period_end: string | null
          period_start: string | null
          portfolio_discount_tiers: Json | null
          retainer_hourly_rate: number | null
          retainer_hours: number | null
          retainer_minimum_value: number | null
          signed_date: string | null
          site_charge_frequency: string | null
          site_size_threshold_kwp: number | null
          trial_setup_fee: number | null
          updated_at: string
          upfront_discount_percent: number | null
          user_id: string
          vendor_api_fee: number | null
          vendor_api_onboarding_fee: number | null
          volume_discounts: Json | null
          ytd_invoiced_amount: number
          zero_pv_alert_enabled: boolean
          zero_pv_estimate_multiplier: number
          zero_pv_grace_days: number
        }
        Insert: {
          above_threshold_price_per_mwp?: number | null
          addons?: Json | null
          ammp_asset_group_id?: string | null
          ammp_asset_group_id_and?: string | null
          ammp_asset_group_id_not?: string | null
          ammp_asset_group_name?: string | null
          ammp_asset_group_name_and?: string | null
          ammp_asset_group_name_not?: string | null
          ammp_asset_ids?: Json | null
          ammp_org_id?: string | null
          ammp_sync_status?: string | null
          anniversary_notice_days?: number
          annual_billing_anchor_date?: string | null
          annual_fee_per_site?: number | null
          annual_minimum_fee?: number | null
          annual_minimum_mode?: string
          api_setup_fee?: number | null
          base_monthly_price?: number | null
          below_threshold_price_per_mwp?: number | null
          billing_frequency?: string | null
          cached_capabilities?: Json | null
          commitment_discount_percent?: number | null
          committed_minimum_mw?: number | null
          company_name: string
          contract_ammp_org_id?: string | null
          contract_expiry_date?: string | null
          contract_name?: string | null
          contract_pdf_url?: string | null
          contract_status?: string | null
          contract_type_id?: string | null
          created_at?: string
          currency?: string | null
          custom_asset_pricing?: Json | null
          custom_pricing?: Json | null
          customer_id: string
          elum_parent_org_id?: string | null
          elum_tier?: string | null
          first_invoice_date?: string | null
          graduated_mw_tiers?: Json | null
          hourly_rate?: number | null
          id?: string
          inflation_cap_enabled?: boolean
          initial_mw: number
          invoice_freeze_enabled?: boolean
          invoice_lead_days?: number
          invoicing_type?: string | null
          irradiance_per_site_tiers?: Json | null
          is_trial?: boolean
          last_ammp_sync?: string | null
          last_anniversary_notice_sent_at?: string | null
          last_annual_invoice_date?: string | null
          max_mw?: number | null
          minimum_annual_value?: number | null
          minimum_charge?: number | null
          minimum_charge_tiers?: Json | null
          modules?: Json | null
          municipality_count?: number | null
          next_invoice_date?: string | null
          notes?: string | null
          ocr_data?: Json | null
          ocr_processed_at?: string | null
          ocr_status?: string | null
          onboarding_fee_per_site?: number | null
          onboarding_setup_fee?: number | null
          org_pricing_config?: Json
          package: string
          performance_per_mwp_tiers?: Json | null
          period_end?: string | null
          period_start?: string | null
          portfolio_discount_tiers?: Json | null
          retainer_hourly_rate?: number | null
          retainer_hours?: number | null
          retainer_minimum_value?: number | null
          signed_date?: string | null
          site_charge_frequency?: string | null
          site_size_threshold_kwp?: number | null
          trial_setup_fee?: number | null
          updated_at?: string
          upfront_discount_percent?: number | null
          user_id: string
          vendor_api_fee?: number | null
          vendor_api_onboarding_fee?: number | null
          volume_discounts?: Json | null
          ytd_invoiced_amount?: number
          zero_pv_alert_enabled?: boolean
          zero_pv_estimate_multiplier?: number
          zero_pv_grace_days?: number
        }
        Update: {
          above_threshold_price_per_mwp?: number | null
          addons?: Json | null
          ammp_asset_group_id?: string | null
          ammp_asset_group_id_and?: string | null
          ammp_asset_group_id_not?: string | null
          ammp_asset_group_name?: string | null
          ammp_asset_group_name_and?: string | null
          ammp_asset_group_name_not?: string | null
          ammp_asset_ids?: Json | null
          ammp_org_id?: string | null
          ammp_sync_status?: string | null
          anniversary_notice_days?: number
          annual_billing_anchor_date?: string | null
          annual_fee_per_site?: number | null
          annual_minimum_fee?: number | null
          annual_minimum_mode?: string
          api_setup_fee?: number | null
          base_monthly_price?: number | null
          below_threshold_price_per_mwp?: number | null
          billing_frequency?: string | null
          cached_capabilities?: Json | null
          commitment_discount_percent?: number | null
          committed_minimum_mw?: number | null
          company_name?: string
          contract_ammp_org_id?: string | null
          contract_expiry_date?: string | null
          contract_name?: string | null
          contract_pdf_url?: string | null
          contract_status?: string | null
          contract_type_id?: string | null
          created_at?: string
          currency?: string | null
          custom_asset_pricing?: Json | null
          custom_pricing?: Json | null
          customer_id?: string
          elum_parent_org_id?: string | null
          elum_tier?: string | null
          first_invoice_date?: string | null
          graduated_mw_tiers?: Json | null
          hourly_rate?: number | null
          id?: string
          inflation_cap_enabled?: boolean
          initial_mw?: number
          invoice_freeze_enabled?: boolean
          invoice_lead_days?: number
          invoicing_type?: string | null
          irradiance_per_site_tiers?: Json | null
          is_trial?: boolean
          last_ammp_sync?: string | null
          last_anniversary_notice_sent_at?: string | null
          last_annual_invoice_date?: string | null
          max_mw?: number | null
          minimum_annual_value?: number | null
          minimum_charge?: number | null
          minimum_charge_tiers?: Json | null
          modules?: Json | null
          municipality_count?: number | null
          next_invoice_date?: string | null
          notes?: string | null
          ocr_data?: Json | null
          ocr_processed_at?: string | null
          ocr_status?: string | null
          onboarding_fee_per_site?: number | null
          onboarding_setup_fee?: number | null
          org_pricing_config?: Json
          package?: string
          performance_per_mwp_tiers?: Json | null
          period_end?: string | null
          period_start?: string | null
          portfolio_discount_tiers?: Json | null
          retainer_hourly_rate?: number | null
          retainer_hours?: number | null
          retainer_minimum_value?: number | null
          signed_date?: string | null
          site_charge_frequency?: string | null
          site_size_threshold_kwp?: number | null
          trial_setup_fee?: number | null
          updated_at?: string
          upfront_discount_percent?: number | null
          user_id?: string
          vendor_api_fee?: number | null
          vendor_api_onboarding_fee?: number | null
          volume_discounts?: Json | null
          ytd_invoiced_amount?: number
          zero_pv_alert_enabled?: boolean
          zero_pv_estimate_multiplier?: number
          zero_pv_grace_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "contracts_contract_type_id_fkey"
            columns: ["contract_type_id"]
            isOneToOne: false
            referencedRelation: "contract_types"
            referencedColumns: ["id"]
          },
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
          combined_minimum_anchor_date: string | null
          combined_minimum_annual_value: number | null
          created_at: string
          id: string
          is_whitelabel_partner: boolean | null
          join_date: string | null
          last_ammp_sync: string | null
          last_combined_minimum_reconciled_at: string | null
          last_invoiced: string | null
          location: string | null
          manual_status_override: boolean | null
          mwp_managed: number | null
          name: string
          nickname: string | null
          status: string | null
          tax_category: string | null
          updated_at: string
          user_id: string
          wht_gross_up_rate: number | null
          xero_branding_theme_id: string | null
          xero_payment_terms_days: number | null
          xero_payment_terms_type: string | null
          xero_tax_type: string | null
        }
        Insert: {
          ammp_asset_ids?: Json | null
          ammp_capabilities?: Json | null
          ammp_org_id?: string | null
          ammp_sync_status?: string | null
          combined_minimum_anchor_date?: string | null
          combined_minimum_annual_value?: number | null
          created_at?: string
          id?: string
          is_whitelabel_partner?: boolean | null
          join_date?: string | null
          last_ammp_sync?: string | null
          last_combined_minimum_reconciled_at?: string | null
          last_invoiced?: string | null
          location?: string | null
          manual_status_override?: boolean | null
          mwp_managed?: number | null
          name: string
          nickname?: string | null
          status?: string | null
          tax_category?: string | null
          updated_at?: string
          user_id: string
          wht_gross_up_rate?: number | null
          xero_branding_theme_id?: string | null
          xero_payment_terms_days?: number | null
          xero_payment_terms_type?: string | null
          xero_tax_type?: string | null
        }
        Update: {
          ammp_asset_ids?: Json | null
          ammp_capabilities?: Json | null
          ammp_org_id?: string | null
          ammp_sync_status?: string | null
          combined_minimum_anchor_date?: string | null
          combined_minimum_annual_value?: number | null
          created_at?: string
          id?: string
          is_whitelabel_partner?: boolean | null
          join_date?: string | null
          last_ammp_sync?: string | null
          last_combined_minimum_reconciled_at?: string | null
          last_invoiced?: string | null
          location?: string | null
          manual_status_override?: boolean | null
          mwp_managed?: number | null
          name?: string
          nickname?: string | null
          status?: string | null
          tax_category?: string | null
          updated_at?: string
          user_id?: string
          wht_gross_up_rate?: number | null
          xero_branding_theme_id?: string | null
          xero_payment_terms_days?: number | null
          xero_payment_terms_type?: string | null
          xero_tax_type?: string | null
        }
        Relationships: []
      }
      ignored_assets: {
        Row: {
          asset_id: string
          asset_name: string | null
          created_at: string
          created_by: string | null
          id: string
          reason: string | null
        }
        Insert: {
          asset_id: string
          asset_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          reason?: string | null
        }
        Update: {
          asset_id?: string
          asset_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          reason?: string | null
        }
        Relationships: []
      }
      inflation_reference_rates: {
        Row: {
          created_at: string
          id: string
          month: string
          rate_pct: number
          source: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          month: string
          rate_pct: number
          source?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          month?: string
          rate_pct?: number
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      invoice_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          acknowledgment_note: string | null
          alert_type: string
          contract_id: string | null
          created_at: string | null
          customer_id: string | null
          description: string
          id: string
          invoice_id: string | null
          is_acknowledged: boolean | null
          metadata: Json | null
          severity: string
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          acknowledgment_note?: string | null
          alert_type: string
          contract_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          description: string
          id?: string
          invoice_id?: string | null
          is_acknowledged?: boolean | null
          metadata?: Json | null
          severity?: string
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          acknowledgment_note?: string | null
          alert_type?: string
          contract_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          description?: string
          id?: string
          invoice_id?: string | null
          is_acknowledged?: boolean | null
          metadata?: Json | null
          severity?: string
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_alerts_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_alerts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_alerts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
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
          input_snapshot: Json | null
          invoice_amount: number
          invoice_amount_eur: number | null
          invoice_date: string
          merged_contract_ids: Json | null
          modules_data: Json | null
          mw_change: number | null
          mw_managed: number
          nrr_amount: number | null
          nrr_amount_eur: number | null
          prepaid_balance_delta: number | null
          prepaid_balance_deltas_by_contract: Json | null
          revised_from_invoice_id: string | null
          revision_deadline: string | null
          revision_reason: string | null
          sharepoint_drive_id: string | null
          sharepoint_file_id: string | null
          sharepoint_files: Json | null
          snapshot_frozen_at: string | null
          source: string | null
          superseded_at: string | null
          superseded_by_invoice_id: string | null
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
          input_snapshot?: Json | null
          invoice_amount: number
          invoice_amount_eur?: number | null
          invoice_date: string
          merged_contract_ids?: Json | null
          modules_data?: Json | null
          mw_change?: number | null
          mw_managed: number
          nrr_amount?: number | null
          nrr_amount_eur?: number | null
          prepaid_balance_delta?: number | null
          prepaid_balance_deltas_by_contract?: Json | null
          revised_from_invoice_id?: string | null
          revision_deadline?: string | null
          revision_reason?: string | null
          sharepoint_drive_id?: string | null
          sharepoint_file_id?: string | null
          sharepoint_files?: Json | null
          snapshot_frozen_at?: string | null
          source?: string | null
          superseded_at?: string | null
          superseded_by_invoice_id?: string | null
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
          input_snapshot?: Json | null
          invoice_amount?: number
          invoice_amount_eur?: number | null
          invoice_date?: string
          merged_contract_ids?: Json | null
          modules_data?: Json | null
          mw_change?: number | null
          mw_managed?: number
          nrr_amount?: number | null
          nrr_amount_eur?: number | null
          prepaid_balance_delta?: number | null
          prepaid_balance_deltas_by_contract?: Json | null
          revised_from_invoice_id?: string | null
          revision_deadline?: string | null
          revision_reason?: string | null
          sharepoint_drive_id?: string | null
          sharepoint_file_id?: string | null
          sharepoint_files?: Json | null
          snapshot_frozen_at?: string | null
          source?: string | null
          superseded_at?: string | null
          superseded_by_invoice_id?: string | null
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
          {
            foreignKeyName: "invoices_revised_from_invoice_id_fkey"
            columns: ["revised_from_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_superseded_by_invoice_id_fkey"
            columns: ["superseded_by_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
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
      sharepoint_connections: {
        Row: {
          access_token: string
          account_name: string | null
          created_at: string
          expires_at: string
          id: string
          is_enabled: boolean | null
          last_sync_at: string | null
          refresh_token: string
          tenant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          account_name?: string | null
          created_at?: string
          expires_at: string
          id?: string
          is_enabled?: boolean | null
          last_sync_at?: string | null
          refresh_token: string
          tenant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          account_name?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          is_enabled?: boolean | null
          last_sync_at?: string | null
          refresh_token?: string
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sharepoint_folder_settings: {
        Row: {
          connection_id: string
          created_at: string
          document_type: string
          drive_id: string
          drive_name: string | null
          folder_id: string | null
          folder_path: string | null
          id: string
          site_id: string
          site_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          connection_id: string
          created_at?: string
          document_type?: string
          drive_id: string
          drive_name?: string | null
          folder_id?: string | null
          folder_path?: string | null
          id?: string
          site_id: string
          site_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          connection_id?: string
          created_at?: string
          document_type?: string
          drive_id?: string
          drive_name?: string | null
          folder_id?: string | null
          folder_path?: string | null
          id?: string
          site_id?: string
          site_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sharepoint_folder_settings_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "sharepoint_connections"
            referencedColumns: ["id"]
          },
        ]
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
      slack_notification_routes: {
        Row: {
          channel_id: string
          channel_name: string | null
          created_at: string | null
          enabled: boolean | null
          id: string
          notification_type: string
          updated_at: string | null
        }
        Insert: {
          channel_id: string
          channel_name?: string | null
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          notification_type: string
          updated_at?: string | null
        }
        Update: {
          channel_id?: string
          channel_name?: string | null
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          notification_type?: string
          updated_at?: string | null
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
          last_sync_at: string | null
          next_sync_at: string | null
          refresh_token: string
          sync_schedule: string | null
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
          last_sync_at?: string | null
          next_sync_at?: string | null
          refresh_token: string
          sync_schedule?: string | null
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
          last_sync_at?: string | null
          next_sync_at?: string | null
          refresh_token?: string
          sync_schedule?: string | null
          tenant_id?: string
          tenant_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      zero_pv_incidents: {
        Row: {
          applied_to_invoice_id: string | null
          asset_id: string
          asset_name: string
          contract_id: string
          created_at: string
          detected_at: string
          estimate_source: string | null
          estimated_capacity_mw: number | null
          id: string
          resolved_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_to_invoice_id?: string | null
          asset_id: string
          asset_name: string
          contract_id: string
          created_at?: string
          detected_at?: string
          estimate_source?: string | null
          estimated_capacity_mw?: number | null
          id?: string
          resolved_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          applied_to_invoice_id?: string | null
          asset_id?: string
          asset_name?: string
          contract_id?: string
          created_at?: string
          detected_at?: string
          estimate_source?: string | null
          estimated_capacity_mw?: number | null
          id?: string
          resolved_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zero_pv_incidents_applied_to_invoice_id_fkey"
            columns: ["applied_to_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zero_pv_incidents_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_write: { Args: { _user_id: string }; Returns: boolean }
      contract_user_unchanged: {
        Args: { _id: string; _user_id: string }
        Returns: boolean
      }
      customer_user_unchanged: {
        Args: { _id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      invoice_alert_user_unchanged: {
        Args: { _id: string; _user_id: string }
        Returns: boolean
      }
      invoice_user_unchanged: {
        Args: { _id: string; _user_id: string }
        Returns: boolean
      }
      notification_user_unchanged: {
        Args: { _id: string; _user_id: string }
        Returns: boolean
      }
      site_billing_user_unchanged: {
        Args: { _id: string; _user_id: string }
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

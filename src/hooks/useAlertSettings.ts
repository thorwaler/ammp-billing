import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface AlertSettings {
  id?: string;
  invoice_increase_warning: number;
  invoice_increase_critical: number;
  invoice_increase_enabled: boolean;
  mw_decrease_enabled: boolean;
  mw_decrease_threshold: number;
  site_decrease_enabled: boolean;
  site_decrease_threshold: number;
  asset_manipulation_enabled: boolean;
  asset_manipulation_window_days: number;
  asset_manipulation_threshold: number;
  // New asset tracking settings
  individual_asset_tracking_enabled: boolean;
  asset_reappear_suspicious_days: number;
  minimum_asset_mw_for_alert: number;
}

export const DEFAULT_SETTINGS: AlertSettings = {
  invoice_increase_warning: 0.30,
  invoice_increase_critical: 0.50,
  invoice_increase_enabled: true,
  mw_decrease_enabled: true,
  mw_decrease_threshold: 0,
  site_decrease_enabled: true,
  site_decrease_threshold: 0,
  asset_manipulation_enabled: true,
  asset_manipulation_window_days: 30,
  asset_manipulation_threshold: 0.05,
  // New asset tracking defaults
  individual_asset_tracking_enabled: true,
  asset_reappear_suspicious_days: 30,
  minimum_asset_mw_for_alert: 0.01,
};

export function useAlertSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<AlertSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('alert_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (data) {
        setSettings({
          id: data.id,
          invoice_increase_warning: Number(data.invoice_increase_warning),
          invoice_increase_critical: Number(data.invoice_increase_critical),
          invoice_increase_enabled: data.invoice_increase_enabled,
          mw_decrease_enabled: data.mw_decrease_enabled,
          mw_decrease_threshold: Number(data.mw_decrease_threshold),
          site_decrease_enabled: data.site_decrease_enabled,
          site_decrease_threshold: data.site_decrease_threshold,
          asset_manipulation_enabled: data.asset_manipulation_enabled,
          asset_manipulation_window_days: data.asset_manipulation_window_days,
          asset_manipulation_threshold: Number(data.asset_manipulation_threshold),
          // New fields
          individual_asset_tracking_enabled: data.individual_asset_tracking_enabled ?? true,
          asset_reappear_suspicious_days: data.asset_reappear_suspicious_days ?? 30,
          minimum_asset_mw_for_alert: Number(data.minimum_asset_mw_for_alert ?? 0.01),
        });
      }
    } catch (err) {
      console.error('Error fetching alert settings:', err);
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSettings = async (newSettings: Partial<AlertSettings>): Promise<boolean> => {
    if (!user?.id) return false;

    setSaving(true);
    setError(null);

    try {
      const updatedSettings = { ...settings, ...newSettings };
      
      if (settings.id) {
        // Update existing
        const { error: updateError } = await supabase
          .from('alert_settings')
          .update({
            invoice_increase_warning: updatedSettings.invoice_increase_warning,
            invoice_increase_critical: updatedSettings.invoice_increase_critical,
            invoice_increase_enabled: updatedSettings.invoice_increase_enabled,
            mw_decrease_enabled: updatedSettings.mw_decrease_enabled,
            mw_decrease_threshold: updatedSettings.mw_decrease_threshold,
            site_decrease_enabled: updatedSettings.site_decrease_enabled,
            site_decrease_threshold: updatedSettings.site_decrease_threshold,
            asset_manipulation_enabled: updatedSettings.asset_manipulation_enabled,
            asset_manipulation_window_days: updatedSettings.asset_manipulation_window_days,
            asset_manipulation_threshold: updatedSettings.asset_manipulation_threshold,
            individual_asset_tracking_enabled: updatedSettings.individual_asset_tracking_enabled,
            asset_reappear_suspicious_days: updatedSettings.asset_reappear_suspicious_days,
            minimum_asset_mw_for_alert: updatedSettings.minimum_asset_mw_for_alert,
          })
          .eq('id', settings.id);

        if (updateError) throw updateError;
      } else {
        // Insert new
        const { data, error: insertError } = await supabase
          .from('alert_settings')
          .insert({
            user_id: user.id,
            invoice_increase_warning: updatedSettings.invoice_increase_warning,
            invoice_increase_critical: updatedSettings.invoice_increase_critical,
            invoice_increase_enabled: updatedSettings.invoice_increase_enabled,
            mw_decrease_enabled: updatedSettings.mw_decrease_enabled,
            mw_decrease_threshold: updatedSettings.mw_decrease_threshold,
            site_decrease_enabled: updatedSettings.site_decrease_enabled,
            site_decrease_threshold: updatedSettings.site_decrease_threshold,
            asset_manipulation_enabled: updatedSettings.asset_manipulation_enabled,
            asset_manipulation_window_days: updatedSettings.asset_manipulation_window_days,
            asset_manipulation_threshold: updatedSettings.asset_manipulation_threshold,
            individual_asset_tracking_enabled: updatedSettings.individual_asset_tracking_enabled,
            asset_reappear_suspicious_days: updatedSettings.asset_reappear_suspicious_days,
            minimum_asset_mw_for_alert: updatedSettings.minimum_asset_mw_for_alert,
          })
          .select()
          .single();

        if (insertError) throw insertError;
        updatedSettings.id = data.id;
      }

      setSettings(updatedSettings);
      return true;
    } catch (err) {
      console.error('Error saving alert settings:', err);
      setError('Failed to save settings');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = async (): Promise<boolean> => {
    return updateSettings(DEFAULT_SETTINGS);
  };

  return {
    settings,
    loading,
    saving,
    error,
    updateSettings,
    resetToDefaults,
    refetch: fetchSettings,
  };
}

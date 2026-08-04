import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface XeroBrandingTheme {
  BrandingThemeID: string;
  Name: string;
}

// Module-level cache so many customer cards share a single Xero call.
let cachedPromise: Promise<XeroBrandingTheme[]> | null = null;

const loadThemes = (): Promise<XeroBrandingTheme[]> => {
  if (!cachedPromise) {
    cachedPromise = (async () => {
      const { data, error } = await supabase.functions.invoke('xero-list-branding-themes');
      if (error) throw error;
      return (data?.themes || []) as XeroBrandingTheme[];
    })().catch((err) => {
      cachedPromise = null; // allow retry on next mount
      throw err;
    });
  }
  return cachedPromise;
};

export const useXeroBrandingThemes = (enabled = true) => {
  const [themes, setThemes] = useState<XeroBrandingTheme[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    loadThemes()
      .then((list) => {
        if (!cancelled) setThemes(list);
      })
      .catch((err: any) => {
        console.error('Failed to load Xero branding themes:', err);
        if (!cancelled) setError(err?.message || 'Could not load Xero branding themes');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [enabled]);

  const themeName = (id?: string | null) =>
    id ? themes.find((t) => t.BrandingThemeID === id)?.Name ?? null : null;

  return { themes, loading, error, themeName };
};

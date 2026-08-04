import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";

export interface XeroBrandingTheme {
  BrandingThemeID: string;
  Name: string;
}

export interface XeroTaxRate {
  TaxType: string;
  Name: string;
  EffectiveRate: number | null;
}

interface SettingsError {
  message: string;
  needsReconnect: boolean;
}

const isSettingsError = (err: unknown): err is SettingsError =>
  typeof err === 'object' && err !== null && 'needsReconnect' in (err as any);

/** Invoke an edge function and surface the real error body (401 => needs reconnect). */
const invokeXeroSettings = async <T,>(fn: string, pick: (payload: any) => T): Promise<T> => {
  const { data, error } = await supabase.functions.invoke(fn);
  if (error) {
    let message = error.message;
    let status: number | undefined;
    if (error instanceof FunctionsHttpError) {
      status = error.context?.status;
      try {
        const body = await error.context.json();
        if (body?.error) message = body.error;
        if (body?.status) status = body.status;
      } catch {
        // keep the generic message
      }
    }
    const settingsError: SettingsError = { message, needsReconnect: status === 401 };
    throw settingsError;
  }
  return pick(data);
};

// Module-level caches so many cards/forms share a single Xero call.
const caches: Record<string, Promise<any> | null> = {};

const loadCached = <T,>(key: string, loader: () => Promise<T>): Promise<T> => {
  if (!caches[key]) {
    caches[key] = loader().catch((err) => {
      caches[key] = null; // allow retry on next mount
      throw err;
    });
  }
  return caches[key] as Promise<T>;
};

const useXeroSettings = <T,>(key: string, loader: () => Promise<T[]>, enabled: boolean) => {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    loadCached(key, loader)
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch((err: unknown) => {
        console.error(`Failed to load ${key}:`, err);
        if (cancelled) return;
        if (isSettingsError(err)) {
          setError(err.message);
          setNeedsReconnect(err.needsReconnect);
        } else {
          setError((err as any)?.message || `Could not load ${key}`);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [enabled, key]);

  return { items, loading, error, needsReconnect };
};

export const useXeroBrandingThemes = (enabled = true) => {
  const { items, loading, error, needsReconnect } = useXeroSettings<XeroBrandingTheme>(
    'xero-branding-themes',
    () => invokeXeroSettings('xero-list-branding-themes', (d) => (d?.themes || []) as XeroBrandingTheme[]),
    enabled,
  );

  const themeName = (id?: string | null) =>
    id ? items.find((t) => t.BrandingThemeID === id)?.Name ?? null : null;

  return { themes: items, loading, error, needsReconnect, themeName };
};

export const useXeroTaxRates = (enabled = true) => {
  const { items, loading, error, needsReconnect } = useXeroSettings<XeroTaxRate>(
    'xero-tax-rates',
    () => invokeXeroSettings('xero-list-tax-rates', (d) => (d?.taxRates || []) as XeroTaxRate[]),
    enabled,
  );

  const taxRateLabel = (taxType?: string | null) => {
    if (!taxType) return null;
    const match = items.find((t) => t.TaxType === taxType);
    if (!match) return null;
    return match.EffectiveRate != null ? `${match.Name} (${match.EffectiveRate}%)` : match.Name;
  };

  return { taxRates: items, loading, error, needsReconnect, taxRateLabel };
};

import { supabase } from "@/integrations/supabase/client";

/**
 * Starts the Xero OAuth flow and redirects the browser to Xero's consent screen.
 * Shared by the integrations page and inline "Reconnect Xero" prompts.
 */
export const startXeroOAuth = async (): Promise<void> => {
  const { data, error } = await supabase.functions.invoke('xero-oauth-init');
  if (error) throw error;
  if (!data?.authUrl) throw new Error('No auth URL returned from server');
  window.location.href = data.authUrl;
};

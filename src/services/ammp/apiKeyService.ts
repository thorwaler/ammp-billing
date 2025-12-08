/**
 * Service for managing AMMP API key in Supabase (server-side storage)
 * Replaces localStorage with secure database storage
 */

import { supabase } from '@/integrations/supabase/client';

// In-memory cache for current session only (never persisted to localStorage)
let cachedApiKey: string | null = null;

export const apiKeyService = {
  /**
   * Store API key securely in database
   */
  async setApiKey(key: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('User must be authenticated to store API key');
    }

    // Upsert the API key for this user
    const { error } = await supabase
      .from('ammp_connections')
      .upsert({
        user_id: user.id,
        api_key: key,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (error) {
      throw new Error(`Failed to store API key: ${error.message}`);
    }

    // Update in-memory cache
    cachedApiKey = key;
  },

  /**
   * Retrieve API key from database
   */
  async getApiKey(): Promise<string | null> {
    // Return cached value if available
    if (cachedApiKey) {
      return cachedApiKey;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return null;
    }

    const { data, error } = await supabase
      .from('ammp_connections')
      .select('api_key')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    // Cache for this session
    cachedApiKey = data.api_key;
    return data.api_key;
  },

  /**
   * Remove API key from database
   */
  async removeApiKey(): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      cachedApiKey = null;
      return;
    }

    await supabase
      .from('ammp_connections')
      .delete()
      .eq('user_id', user.id);

    cachedApiKey = null;
  },

  /**
   * Check if API key exists
   */
  async hasApiKey(): Promise<boolean> {
    const key = await this.getApiKey();
    return !!key;
  },

  /**
   * Clear in-memory cache (useful on logout)
   */
  clearCache(): void {
    cachedApiKey = null;
  }
};

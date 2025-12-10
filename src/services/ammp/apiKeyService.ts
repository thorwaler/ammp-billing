/**
 * Service for managing AMMP API key in Supabase (server-side storage)
 * Integrations are shared across all team members
 */

import { supabase } from '@/integrations/supabase/client';

// In-memory cache for current session only (never persisted to localStorage)
let cachedApiKey: string | null = null;

export const apiKeyService = {
  /**
   * Store API key securely in database (shared across team)
   */
  async setApiKey(key: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('User must be authenticated to store API key');
    }

    // Check if a connection already exists
    const { data: existing } = await supabase
      .from('ammp_connections')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (existing) {
      // Update existing connection
      const { error } = await supabase
        .from('ammp_connections')
        .update({
          api_key: key,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);

      if (error) {
        throw new Error(`Failed to update API key: ${error.message}`);
      }
    } else {
      // Create new connection (store user_id for audit purposes)
      const { error } = await supabase
        .from('ammp_connections')
        .insert({
          user_id: user.id,
          api_key: key,
        });

      if (error) {
        throw new Error(`Failed to store API key: ${error.message}`);
      }
    }

    // Update in-memory cache
    cachedApiKey = key;
  },

  /**
   * Retrieve API key from database (shared connection)
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

    // Fetch ANY existing AMMP connection (shared across team)
    const { data, error } = await supabase
      .from('ammp_connections')
      .select('api_key')
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    // Cache for this session
    cachedApiKey = data.api_key;
    return data.api_key;
  },

  /**
   * Remove API key from database (removes shared connection)
   */
  async removeApiKey(): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      cachedApiKey = null;
      return;
    }

    // Get the shared connection and delete it
    const { data: existing } = await supabase
      .from('ammp_connections')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('ammp_connections')
        .delete()
        .eq('id', existing.id);
    }

    cachedApiKey = null;
  },

  /**
   * Check if API key exists (shared connection)
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
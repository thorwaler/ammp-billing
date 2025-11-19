/**
 * Service for managing AMMP Bearer token authentication
 */

import { apiKeyService } from './apiKeyService';

interface TokenResponse {
  access_token: string;
}

interface TokenData {
  token: string;
  expiresAt: number;
}

const TOKEN_API_URL = 'https://data-api.ammp.io/v1/token';
let cachedToken: TokenData | null = null;

/**
 * Parse JWT to extract expiration timestamp
 */
function parseJwtExpiration(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000; // Convert to milliseconds
  } catch (error) {
    console.error('Failed to parse JWT:', error);
    return 0;
  }
}

/**
 * Check if token is still valid (with 5 minute buffer)
 */
function isTokenValid(tokenData: TokenData | null): boolean {
  if (!tokenData) return false;
  const bufferMs = 5 * 60 * 1000; // 5 minutes
  return Date.now() < (tokenData.expiresAt - bufferMs);
}

/**
 * Exchange API key for Bearer token via backend proxy
 */
async function exchangeApiKeyForToken(apiKey: string): Promise<string> {
  // Use backend edge function to avoid CORS issues
  const { data, error } = await (await import('@/integrations/supabase/client')).supabase.functions.invoke(
    'ammp-token-exchange',
    {
      body: { apiKey }
    }
  );

  if (error) {
    console.error('Token exchange error:', error);
    throw new Error(`Failed to authenticate: ${error.message}`);
  }

  if (!data?.access_token) {
    throw new Error('Failed to authenticate: No access token received');
  }

  const expiresAt = parseJwtExpiration(data.access_token);

  cachedToken = {
    token: data.access_token,
    expiresAt,
  };

  return data.access_token;
}

export const authService = {
  /**
   * Get valid Bearer token (returns cached or refreshes)
   */
  async getValidToken(): Promise<string> {
    if (isTokenValid(cachedToken)) {
      return cachedToken!.token;
    }

    const apiKey = apiKeyService.getApiKey();
    if (!apiKey) {
      throw new Error('No API key found. Please connect to AMMP API first.');
    }

    return exchangeApiKeyForToken(apiKey);
  },

  /**
   * Clear cached token from memory
   */
  clearToken(): void {
    cachedToken = null;
  },

  /**
   * Exchange API key for token (used for initial connection)
   */
  async authenticate(apiKey: string): Promise<string> {
    return exchangeApiKeyForToken(apiKey);
  }
};

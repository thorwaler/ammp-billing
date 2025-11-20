/**
 * HTTP client for AMMP Data API with Bearer token authentication via backend proxy
 */

import { authService } from './authService';
import { supabase } from '@/integrations/supabase/client';
import { AssetResponse, DeviceResponse, DataApiRequestError } from '@/types/ammp-api';

/**
 * Generic request method with Bearer token authentication and automatic retry on 401
 * Routes all requests through the backend proxy to avoid CORS issues
 */
async function request<T>(path: string, options: RequestInit = {}, retryCount = 0): Promise<T> {
  const token = await authService.getValidToken();

  const { data, error } = await supabase.functions.invoke('ammp-data-proxy', {
    body: {
      path,
      method: options.method ?? 'GET',
      token,
    },
  });

  // Check if the edge function returned an error in the data field (e.g., 404 from AMMP API)
  if (data && typeof data === 'object' && 'error' in data && 'status' in data) {
    const errorData = data as { error: string; details: string; status: number };
    
    // Handle 404 specifically - this means the resource doesn't exist
    if (errorData.status === 404) {
      throw new DataApiRequestError(
        'Resource not found',
        path,
        options,
        404,
        errorData.details
      );
    }
    
    // Handle other error statuses
    throw new DataApiRequestError(
      errorData.error || 'API request failed',
      path,
      options,
      errorData.status,
      errorData.details
    );
  }

  // Handle token expiration with automatic refresh and retry
  if (error && (error as any).status === 401 && retryCount === 0) {
    console.log('Token expired (via proxy), refreshing and retrying request...');
    
    // Force token refresh
    authService.clearToken();
    
    try {
      await authService.getValidToken();
      // Retry the request once with new token
      return request<T>(path, options, retryCount + 1);
    } catch (refreshError) {
      throw new DataApiRequestError(
        'Authentication failed. Please reconnect to AMMP API.',
        path,
        options,
        401,
        'Token refresh failed'
      );
    }
  }

  // Handle other errors
  if (error) {
    const status = (error as any).status ?? 500;
    const errorDetails = (error as any).details ?? error.message;
    
    let errorMessage = `API request failed: ${status}`;
    
    // Provide user-friendly error messages
    if (status === 401) {
      errorMessage = 'Invalid API key or token expired. Please reconnect.';
    } else if (status === 429) {
      errorMessage = 'Too many requests. Please wait a moment and try again.';
    } else if (status >= 500) {
      errorMessage = 'AMMP API is experiencing issues. Please try again later.';
    } else if (!navigator.onLine) {
      errorMessage = 'Cannot reach AMMP API. Check your internet connection.';
    }
    
    throw new DataApiRequestError(
      errorMessage,
      path,
      options,
      status,
      errorDetails
    );
  }

  // Success: data is the JSON returned by the proxy
  return data as T;
}

export const dataApiClient = {
  /**
   * List all assets
   */
  async listAssets(): Promise<AssetResponse[]> {
    return request<AssetResponse[]>('/assets');
  },

  /**
   * Get single asset by ID
   */
  async getAsset(assetId: string): Promise<AssetResponse> {
    return request<AssetResponse>(`/assets/${assetId}`);
  },

  /**
   * Get devices for an asset
   */
  async getAssetDevices(assetId: string): Promise<DeviceResponse[]> {
    return request<DeviceResponse[]>(`/assets/${assetId}/devices`);
  }
};

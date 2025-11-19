/**
 * HTTP client for AMMP Data API with Bearer token authentication
 */

import { authService } from './authService';
import { AssetResponse, DeviceResponse, DataApiRequestError } from '@/types/ammp-api';

const BASE_URL = 'https://data-api.ammp.io/v1';

/**
 * Generic request method with Bearer token authentication and automatic retry on 401
 */
async function request<T>(path: string, options: RequestInit = {}, retryCount = 0): Promise<T> {
  const token = await authService.getValidToken();
  const url = `${BASE_URL}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'accept': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });

  // Handle token expiration with automatic refresh and retry
  if (response.status === 401 && retryCount === 0) {
    console.log('Token expired, refreshing and retrying request...');
    
    // Force token refresh
    authService.clearToken();
    
    try {
      await authService.getValidToken();
      // Retry the request once with new token
      return request<T>(path, options, retryCount + 1);
    } catch (refreshError) {
      throw new DataApiRequestError(
        'Authentication failed. Please reconnect to AMMP API.',
        url,
        options,
        401,
        'Token refresh failed'
      );
    }
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error');
    
    let errorMessage = `API request failed: ${response.status} ${response.statusText}`;
    
    // Provide user-friendly error messages
    if (response.status === 401) {
      errorMessage = 'Invalid API key or token expired. Please reconnect.';
    } else if (response.status === 429) {
      errorMessage = 'Too many requests. Please wait a moment and try again.';
    } else if (response.status >= 500) {
      errorMessage = 'AMMP API is experiencing issues. Please try again later.';
    } else if (!navigator.onLine) {
      errorMessage = 'Cannot reach AMMP API. Check your internet connection.';
    }
    
    throw new DataApiRequestError(
      errorMessage,
      url,
      options,
      response.status,
      errorBody
    );
  }

  return response.json();
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

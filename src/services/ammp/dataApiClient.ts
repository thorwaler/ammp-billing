/**
 * HTTP client for AMMP Data API with Bearer token authentication
 */

import { authService } from './authService';
import { AssetResponse, DeviceResponse, DataApiRequestError } from '@/types/ammp-api';

const BASE_URL = 'https://data-api.ammp.io/v1';

/**
 * Generic request method with Bearer token authentication
 */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
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

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error');
    throw new DataApiRequestError(
      `API request failed: ${response.status} ${response.statusText}`,
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

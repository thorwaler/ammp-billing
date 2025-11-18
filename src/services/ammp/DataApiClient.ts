import type {
  UUID,
  AssetResponse,
  DeviceResponse,
  AssetDataResponse,
  AssetBulkDataRequestBody,
} from '@/types/ammp-api'
import { DataApiRequestError } from '@/types/ammp-api'

export class DataApiClient {
  private baseURL = 'https://os.ammp.io/api/v1/data-api/v1'

  // Detect if we need API key or cookie auth
  private isDevEnvironment(): boolean {
    const origin = window.location.origin
    return !origin.includes('os.ammp.io') && 
           !origin.includes('localhost:8080')
  }

  // Get auth headers based on environment
  private getAuthHeaders(): Record<string, string> {
    if (this.isDevEnvironment()) {
      const apiKey = localStorage.getItem('ammp_data_api_key')
      if (!apiKey) {
        throw new Error('AMMP API key not found. Please configure in Integrations.')
      }
      return { 'X-Api-Key': apiKey }
    }
    // Production uses cookies - no headers needed
    return {}
  }

  // Generic request handler
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseURL}${path}`

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...this.getAuthHeaders(),
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          ...options.headers,
        },
        credentials: 'include' // Always include for cookie auth
      })

      if (!response.ok) {
        const errorBody = await response.text()
        throw new DataApiRequestError(
          `API request failed: ${response.status} ${response.statusText}`,
          url,
          options,
          response.status,
          errorBody
        )
      }

      return response.json()
    } catch (error) {
      if (error instanceof DataApiRequestError) {
        throw error
      }
      throw new DataApiRequestError(
        `Network error: ${(error as Error).message}`,
        url,
        options
      )
    }
  }

  // ====== PUBLIC API METHODS ======

  // List all assets
  async listAssets(): Promise<AssetResponse[]> {
    return this.request<AssetResponse[]>('/assets', { method: 'GET' })
  }

  // Get specific asset
  async getAsset(assetId: UUID): Promise<AssetResponse> {
    return this.request<AssetResponse>(`/assets/${assetId}`, { method: 'GET' })
  }

  // Get devices for an asset
  async getDevices(assetId: UUID): Promise<DeviceResponse[]> {
    return this.request<DeviceResponse[]>(
      `/assets/${assetId}/devices`,
      { method: 'GET' }
    )
  }

  // Bulk request for timeseries data
  async bulkRequestAssetData(
    endpoint: string,
    body: AssetBulkDataRequestBody
  ): Promise<AssetDataResponse[]> {
    const response = await this.request<{ data: AssetDataResponse[] }>(
      `/bulk-data/asset/${endpoint}`,
      {
        method: 'POST',
        body: JSON.stringify(body)
      }
    )
    return response.data
  }

  // Test connection
  async testConnection(): Promise<boolean> {
    try {
      await this.listAssets()
      return true
    } catch (error) {
      console.error('AMMP API connection test failed:', error)
      return false
    }
  }
}

// Singleton instance
export const dataApiClient = new DataApiClient()

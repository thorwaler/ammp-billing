import type {
  UUID,
  AssetResponse,
  DeviceResponse,
  AssetDataResponse,
  AssetBulkDataRequestBody,
} from '@/types/ammp-api'
import { DataApiRequestError } from '@/types/ammp-api'
import { dataApiKeyService } from './dataApiKeyService'

export class DataApiClient {
  private baseURL = 'https://data-api.ammp.io/v1'

  // Get auth headers with API key
  private getAuthHeaders(): Record<string, string> {
    const apiKey = dataApiKeyService.getApiKey()
    
    if (!apiKey) {
      // Prompt user for API key if not found
      const newKey = dataApiKeyService.promptAndSetApiKey()
      if (!newKey) {
        throw new Error('AMMP API key is required. Please provide your API key.')
      }
    }
    
    const finalApiKey = dataApiKeyService.getApiKey()!
    
    return {
      'X-Api-Key': finalApiKey,
      'Accept': 'application/json',
    }
  }

  // Clear connection (for logout/disconnect)
  clearToken(): void {
    console.log('AMMP connection cleared')
  }

  // Generic request handler
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseURL}${path}`

    try {
      // Get auth headers with API key
      const authHeaders = this.getAuthHeaders()
      
      // Only add Content-Type for requests with a body
      const method = options.method?.toUpperCase() || 'GET'
      const shouldIncludeContentType = ['POST', 'PUT', 'PATCH'].includes(method) && options.body
      
      const headers: Record<string, string> = {
        ...authHeaders,
        ...(shouldIncludeContentType && { 'Content-Type': 'application/json' }),
      }
      
      const response = await fetch(url, {
        ...options,
        headers: {
          ...headers,
          ...options.headers,
        },
        credentials: 'include', // Always include for cookie auth
      })

      if (!response.ok) {
        const errorBody = await response.text()
        throw new DataApiRequestError(
          `AMMP API request failed: ${response.status} ${response.statusText}`,
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
        `Network error calling AMMP API: ${(error as Error).message}`,
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

  // Get devices for an asset (returns full asset with nested devices)
  async getDevices(assetId: UUID): Promise<AssetResponse> {
    return this.request<AssetResponse>(
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

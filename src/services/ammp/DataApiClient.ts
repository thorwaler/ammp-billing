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
  private baseURL = 'https://os.ammp.io/api/v1/data-api/v1'

  // Detect if we're in a cookie-auth environment (production, staging, or localhost)
  private isCookieAuthEnvironment(): boolean {
    const origin = window.location.origin
    return origin.includes('os.ammp.io') || 
           origin.includes('os.stage.ammp.io') || 
           origin.includes('localhost:8080')
  }

  // Get auth headers based on environment
  private getAuthHeaders(): Record<string, string> {
    if (this.isCookieAuthEnvironment()) {
      // Production/staging/localhost: verify cookie exists
      if (!document.cookie.includes('ammp_sso_access_token=')) {
        throw new Error('Authentication cookie not found. Please log in to AMMP OS and refresh.')
      }
      // Cookies are sent automatically via credentials: 'include'
      return {}
    } else {
      // Development (Lovable): use API key
      const apiKey = dataApiKeyService.getApiKey()
      if (!apiKey) {
        // Auto-prompt for API key if not set
        const newKey = dataApiKeyService.promptAndSetApiKey()
        if (!newKey) {
          throw new Error('AMMP API key is required. Please provide your API key.')
        }
        return { 'X-Api-Key': newKey }
      }
      return { 'X-Api-Key': apiKey }
    }
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

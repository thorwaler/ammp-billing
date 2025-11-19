import type {
  UUID,
  AssetResponse,
  DeviceResponse,
  AssetDataResponse,
  AssetBulkDataRequestBody,
  TokenResponse,
} from '@/types/ammp-api'
import { DataApiRequestError } from '@/types/ammp-api'
import { dataApiKeyService } from './dataApiKeyService'

export class DataApiClient {
  private baseURL = 'https://data-api.ammp.io/v1'
  private token: string | null = null
  private tokenExpiry: number | null = null

  // Acquire Bearer token using API key
  private async acquireToken(): Promise<string> {
    const apiKey = dataApiKeyService.getApiKey()
    if (!apiKey) {
      // Prompt user for API key if not found
      const newKey = dataApiKeyService.promptAndSetApiKey()
      if (!newKey) {
        throw new Error('AMMP API key is required. Please provide your API key.')
      }
    }

    const finalApiKey = dataApiKeyService.getApiKey()!
    
    try {
      const response = await fetch('https://data-api.ammp.io/v1/token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'X-Api-Key': finalApiKey,
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new DataApiRequestError(
          `Failed to acquire AMMP access token: ${response.status} ${response.statusText}`,
          response.url,
          { method: 'POST' },
          response.status,
          errorText
        )
      }

      const data: TokenResponse = await response.json()
      
      // Decode JWT to get expiry (exp field)
      const payload = JSON.parse(atob(data.access_token.split('.')[1]))
      
      this.token = data.access_token
      this.tokenExpiry = payload.exp * 1000 // Convert to milliseconds
      
      console.log('AMMP token acquired, expires at:', new Date(this.tokenExpiry))
      
      return this.token
    } catch (error) {
      if (error instanceof DataApiRequestError) throw error
      throw new Error(`Network error acquiring token: ${(error as Error).message}`)
    }
  }

  // Ensure we have a valid token (refresh if needed)
  private async ensureValidToken(): Promise<string> {
    const now = Date.now()
    
    // If no token or token expired (with 5 min buffer), acquire new one
    if (!this.token || !this.tokenExpiry || this.tokenExpiry - now < 5 * 60 * 1000) {
      console.log('Token missing or expiring soon, acquiring new token...')
      return await this.acquireToken()
    }
    
    return this.token
  }

  // Get auth headers with Bearer token
  private async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.ensureValidToken()
    return {
      'Authorization': `Bearer ${token}`
    }
  }

  // Clear token (for logout/disconnect)
  clearToken(): void {
    this.token = null
    this.tokenExpiry = null
    console.log('AMMP token cleared')
  }

  // Generic request handler
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseURL}${path}`

    try {
      // Get auth headers with Bearer token
      const authHeaders = await this.getAuthHeaders()
      
      // Only add Content-Type for requests with a body
      const method = options.method?.toUpperCase() || 'GET'
      const shouldIncludeContentType = ['POST', 'PUT', 'PATCH'].includes(method) && options.body
      
      const headers: Record<string, string> = {
        ...authHeaders,
        'Accept': 'application/json',
        ...(shouldIncludeContentType && { 'Content-Type': 'application/json' }),
      }
      
      const response = await fetch(url, {
        ...options,
        headers: {
          ...headers,
          ...options.headers,
        },
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

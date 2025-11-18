/**
 * Centralized service for managing AMMP Data API keys
 * Used in development environments where cookie auth is not available
 */
class DataApiKeyService {
  static readonly KEY_STORAGE_NAME = "ammp-api-key-for-lovable"

  constructor(protected readonly storage: Storage = window.localStorage) {}

  /**
   * Retrieve stored API key from localStorage
   */
  getApiKey(): string | null {
    return this.storage.getItem(DataApiKeyService.KEY_STORAGE_NAME)
  }

  /**
   * Store API key in localStorage
   */
  setApiKey(apiKey: string): void {
    this.storage.setItem(DataApiKeyService.KEY_STORAGE_NAME, apiKey)
  }

  /**
   * Remove API key from localStorage
   */
  clearApiKey(): void {
    this.storage.removeItem(DataApiKeyService.KEY_STORAGE_NAME)
  }

  /**
   * Prompt user for API key using browser native prompt
   * Returns the entered key and stores it if provided
   */
  promptAndSetApiKey(): string | null {
    const currentKey = this.getApiKey()
    const apiKey = prompt(
      "Please enter your AMMP Data API key:",
      currentKey ?? ""
    )?.trim() ?? null
    
    if (apiKey) {
      this.setApiKey(apiKey)
    }
    
    return apiKey
  }
}

export const dataApiKeyService = new DataApiKeyService()

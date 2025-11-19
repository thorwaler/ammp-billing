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
   * Check if an API key exists in storage
   */
  hasApiKey(): boolean {
    const key = this.getApiKey()
    return !!key && key.length > 0
  }

  /**
   * Validate API key format (basic check)
   */
  isValidFormat(apiKey: string): boolean {
    // Basic validation - at least 20 characters, alphanumeric
    return apiKey.length >= 20 && /^[a-zA-Z0-9_-]+$/.test(apiKey)
  }

  /**
   * Prompt user for API key using browser native prompt
   * Returns the entered key and stores it if provided
   */
  promptAndSetApiKey(): string | null {
    const currentKey = this.getApiKey()
    
    const message = currentKey 
      ? "Current API key found. Enter a new one or press OK to keep existing:"
      : "Please enter your AMMP Data API key.\n\nGet your key from: AMMP OS → Settings → API Access"
    
    const apiKey = prompt(message, currentKey ?? "")?.trim() ?? null
    
    if (apiKey) {
      // Basic validation
      if (!this.isValidFormat(apiKey)) {
        alert("Invalid API key format. Keys should be at least 20 characters long and contain only letters, numbers, hyphens, and underscores.")
        return null
      }
      
      this.setApiKey(apiKey)
      console.log("✅ API key stored successfully")
    }
    
    return apiKey
  }
}

export const dataApiKeyService = new DataApiKeyService()

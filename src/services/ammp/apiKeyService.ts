/**
 * Service for managing AMMP API key in localStorage
 */

const STORAGE_KEY = 'ammp_api_key';

export const apiKeyService = {
  setApiKey(key: string): void {
    localStorage.setItem(STORAGE_KEY, key);
  },

  getApiKey(): string | null {
    return localStorage.getItem(STORAGE_KEY);
  },

  removeApiKey(): void {
    localStorage.removeItem(STORAGE_KEY);
  },

  hasApiKey(): boolean {
    return !!this.getApiKey();
  }
};

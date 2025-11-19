/**
 * Environment detection utilities for AMMP integration
 * Determines authentication method based on deployment context
 */

// Check if we're in development mode
export const IS_DEV = import.meta.env.DEV

// Check if we're in Lovable environment (deployed dev, not localhost)
export const IS_LOVABLE = IS_DEV && 
  typeof window !== 'undefined' && 
  !window.location.origin.includes('localhost')

// Check if we're in production/staging
export const IS_PROD = !IS_DEV

/**
 * Determine which authentication method to use
 * - Lovable: API key via X-Api-Key header
 * - Production/Localhost: Cookie-based auth
 */
export function getAuthMethod(): 'api-key' | 'cookie' {
  return IS_LOVABLE ? 'api-key' : 'cookie'
}

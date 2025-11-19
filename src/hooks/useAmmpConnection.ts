import { useState, useEffect } from 'react'
import { dataApiClient } from '@/services/ammp/DataApiClient'
import { dataApiKeyService } from '@/services/ammp/dataApiKeyService'
import type { AssetResponse } from '@/types/ammp-api'
import { toast } from '@/hooks/use-toast'
import { IS_LOVABLE } from '@/utils/environment'

interface UseAmmpConnectionReturn {
  isConnected: boolean
  isConnecting: boolean
  assets: AssetResponse[]
  error: string | null
  testConnection: () => Promise<boolean>
  disconnect: () => void
}

export function useAmmpConnection(): UseAmmpConnectionReturn {
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [assets, setAssets] = useState<AssetResponse[]>([])
  const [error, setError] = useState<string | null>(null)

  // Test connection
  const testConnection = async (): Promise<boolean> => {
    setIsConnecting(true)
    setError(null)

    try {
      // In Lovable, ensure we have an API key
      if (IS_LOVABLE) {
        let apiKey = dataApiKeyService.getApiKey()
        
        if (!apiKey) {
          // Prompt for API key
          apiKey = dataApiKeyService.promptAndSetApiKey()
          if (!apiKey) {
            throw new Error('API key is required to connect in Lovable environment')
          }
        }
      }

      // Try to fetch assets
      const fetchedAssets = await dataApiClient.listAssets()
      setAssets(fetchedAssets)
      setIsConnected(true)
      
      toast({
        title: 'Connected to AMMP',
        description: `Found ${fetchedAssets.length} assets`,
      })

      return true
    } catch (err: any) {
      setIsConnected(false)
      setAssets([])
      
      // Parse error message
      const errorMsg = err.message || 'Connection failed'
      const statusCode = err.status || 0
      
      // Clear invalid API key on auth errors
      if (IS_LOVABLE && (statusCode === 401 || statusCode === 403)) {
        dataApiKeyService.clearApiKey()
        setError('Invalid API key. Please try connecting again with a valid key.')
        
        toast({
          title: 'Authentication Failed',
          description: 'Invalid API key. It has been cleared. Please try again.',
          variant: 'destructive',
        })
      } else {
        setError(errorMsg)
        
        toast({
          title: 'Connection Failed',
          description: errorMsg,
          variant: 'destructive',
        })
      }

      return false
    } finally {
      setIsConnecting(false)
    }
  }

  // Disconnect
  const disconnect = () => {
    setIsConnected(false)
    setAssets([])
    setError(null)
    
    // Clear token and API key
    dataApiClient.clearToken()
    dataApiKeyService.clearApiKey()
    
    toast({
      title: 'Disconnected from AMMP',
    })
  }

  // Auto-connect on mount (smarter logic)
  useEffect(() => {
    const autoConnect = async () => {
      // Don't auto-connect if already connected or connecting
      if (isConnected || isConnecting) return

      // In Lovable: only auto-connect if we have an API key
      if (IS_LOVABLE) {
        const apiKey = dataApiKeyService.getApiKey()
        if (apiKey) {
          console.log('Auto-connecting with stored API key...')
          await testConnection()
        }
      } else {
        // In production/localhost: check for auth cookie
        const hasAuthCookie = document.cookie.includes('ammp-admin-authtoken')
        if (hasAuthCookie) {
          console.log('Auto-connecting with auth cookie...')
          await testConnection()
        }
      }
    }

    autoConnect()
  }, []) // Empty deps - only run once on mount

  return {
    isConnected,
    isConnecting,
    assets,
    error,
    testConnection,
    disconnect
  }
}

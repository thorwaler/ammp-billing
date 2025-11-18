import { useState, useEffect } from 'react'
import { dataApiClient } from '@/services/ammp/DataApiClient'
import { dataApiKeyService } from '@/services/ammp/dataApiKeyService'
import type { AssetResponse } from '@/types/ammp-api'
import { toast } from '@/hooks/use-toast'

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
      
      const errorMsg = err.message || 'Connection failed'
      setError(errorMsg)
      
      toast({
        title: 'Connection Failed',
        description: errorMsg,
        variant: 'destructive',
      })

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
    
    // Clear API key
    dataApiKeyService.clearApiKey()
    
    toast({
      title: 'Disconnected from AMMP',
    })
  }

  // Auto-connect on mount
  useEffect(() => {
    const autoConnect = async () => {
      const origin = window.location.origin
      const isCookieAuth = origin.includes('os.ammp.io') || 
                          origin.includes('os.stage.ammp.io') || 
                          origin.includes('localhost:8080')

      if (isCookieAuth) {
        // Cookie-based auth: check for cookie and try to connect
        if (document.cookie.includes('ammp_sso_access_token=')) {
          await testConnection()
        }
      } else {
        // Development: check for API key
        const apiKey = dataApiKeyService.getApiKey()
        if (apiKey) {
          await testConnection()
        }
      }
    }

    autoConnect()
  }, [])

  return {
    isConnected,
    isConnecting,
    assets,
    error,
    testConnection,
    disconnect
  }
}

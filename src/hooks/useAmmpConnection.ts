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
    
    // Clear token and API key
    dataApiClient.clearToken()
    dataApiKeyService.clearApiKey()
    
    toast({
      title: 'Disconnected from AMMP',
    })
  }

  // Auto-connect on mount
  useEffect(() => {
    const autoConnect = async () => {
      // Check for API key and try to connect
      const apiKey = dataApiKeyService.getApiKey()
      if (apiKey) {
        await testConnection()
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

import { useState, useEffect } from 'react'
import { dataApiClient } from '@/services/ammp/DataApiClient'
import type { AssetResponse } from '@/types/ammp-api'
import { toast } from '@/hooks/use-toast'

interface UseAmmpConnectionReturn {
  isConnected: boolean
  isConnecting: boolean
  assets: AssetResponse[]
  error: string | null
  testConnection: () => Promise<boolean>
  disconnect: () => void
  setApiKey: (key: string) => void
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
    
    // Clear API key if in dev
    if (!window.location.origin.includes('os.ammp.io') && 
        !window.location.origin.includes('localhost:8080')) {
      localStorage.removeItem('ammp_data_api_key')
    }
    
    toast({
      title: 'Disconnected from AMMP',
    })
  }

  // Set API key (dev only)
  const setApiKey = (key: string) => {
    localStorage.setItem('ammp_data_api_key', key)
    testConnection()
  }

  // Auto-connect on mount
  useEffect(() => {
    const autoConnect = async () => {
      const origin = window.location.origin
      const isProduction = origin.includes('os.ammp.io') || origin.includes('localhost:8080')

      if (isProduction) {
        // Try cookie-based auth
        await testConnection()
      } else {
        // Check for API key
        const apiKey = localStorage.getItem('ammp_data_api_key')
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
    disconnect,
    setApiKey
  }
}

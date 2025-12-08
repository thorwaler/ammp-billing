/**
 * React hook for AMMP API connection state management
 */

import { useState, useEffect } from 'react';
import { apiKeyService } from '@/services/ammp/apiKeyService';
import { authService } from '@/services/ammp/authService';
import { dataApiClient } from '@/services/ammp/dataApiClient';
import { AssetResponse } from '@/types/ammp-api';
import { useToast } from '@/hooks/use-toast';

interface UseAmmpConnectionResult {
  isConnected: boolean;
  isConnecting: boolean;
  connect: (apiKey: string) => Promise<void>;
  disconnect: () => void;
  testConnection: () => Promise<boolean>;
  assets: AssetResponse[] | null;
  error: string | null;
}

export function useAmmpConnection(): UseAmmpConnectionResult {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [assets, setAssets] = useState<AssetResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  /**
   * Connect to AMMP API with provided API key
   */
  const connect = async (apiKey: string) => {
    setIsConnecting(true);
    setError(null);

    try {
      // Store API key securely in database
      await apiKeyService.setApiKey(apiKey);

      // Exchange for Bearer token
      await authService.authenticate(apiKey);

      // Test connection by fetching assets
      const fetchedAssets = await dataApiClient.listAssets();
      setAssets(fetchedAssets);
      setIsConnected(true);

      toast({
        title: 'Connected to AMMP API',
        description: `Successfully connected. ${fetchedAssets.length} assets available.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect to AMMP API';
      setError(message);
      setIsConnected(false);
      setAssets(null);
      
      // Clear stored credentials on failure
      await apiKeyService.removeApiKey();
      authService.clearToken();

      toast({
        title: 'Connection Failed',
        description: message,
        variant: 'destructive',
      });

      throw err;
    } finally {
      setIsConnecting(false);
    }
  };

  /**
   * Disconnect and clear stored credentials
   */
  const disconnect = async () => {
    await apiKeyService.removeApiKey();
    authService.clearToken();
    setIsConnected(false);
    setAssets(null);
    setError(null);

    toast({
      title: 'Disconnected',
      description: 'AMMP API credentials have been cleared.',
    });
  };

  /**
   * Test connection by fetching assets
   */
  const testConnection = async (): Promise<boolean> => {
    try {
      const fetchedAssets = await dataApiClient.listAssets();
      setAssets(fetchedAssets);
      setError(null);

      toast({
        title: 'Connection Successful',
        description: `${fetchedAssets.length} assets available.`,
      });

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection test failed';
      setError(message);

      toast({
        title: 'Connection Test Failed',
        description: message,
        variant: 'destructive',
      });

      return false;
    }
  };

  /**
   * Auto-connect on mount if API key exists in database
   */
  useEffect(() => {
    const autoConnect = async () => {
      const hasKey = await apiKeyService.hasApiKey();
      if (hasKey && !isConnected) {
        const apiKey = await apiKeyService.getApiKey();
        if (apiKey) {
          try {
            // Exchange for Bearer token
            await authService.authenticate(apiKey);
            
            // Test connection by fetching assets
            const fetchedAssets = await dataApiClient.listAssets();
            setAssets(fetchedAssets);
            setIsConnected(true);
          } catch {
            // Silent fail on auto-connect
          }
        }
      }
    };

    autoConnect();
  }, []);

  return {
    isConnected,
    isConnecting,
    connect,
    disconnect,
    testConnection,
    assets,
    error,
  };
}

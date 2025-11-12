import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/components/ui/use-toast";
import { CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Label } from "@/components/ui/label";

interface XeroSettings {
  invoiceTemplate: string;
  isEnabled: boolean;
}

interface XeroConnection {
  id: string;
  user_id: string;
  tenant_id: string;
  tenant_name: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  invoice_template: string | null;
  is_enabled: boolean | null;
  created_at: string;
  updated_at: string;
}

const XeroIntegration = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [tenantName, setTenantName] = useState<string>('');
  
  const [settings, setSettings] = useState<XeroSettings>({
    invoiceTemplate: 'standard',
    isEnabled: true,
  });

  // Load connection status on mount
  useEffect(() => {
    loadConnection();
  }, [user]);

  // Handle OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('xero_callback') === 'true') {
      const code = params.get('code');
      const state = params.get('state');
      
      if (code && state) {
        handleOAuthCallback(code, state);
      }
    }
  }, []);

  const loadConnection = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('xero_connections' as any)
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data && !error) {
        const connection = data as unknown as XeroConnection;
        setIsConnected(connection.is_enabled || false);
        setTenantName(connection.tenant_name || '');
        setSettings({
          invoiceTemplate: connection.invoice_template || 'standard',
          isEnabled: connection.is_enabled || false,
        });
      }
    } catch (error) {
      console.error('Error loading connection:', error);
    }
  };

  const handleOAuthCallback = async (code: string, state: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('xero-oauth-callback', {
        body: { code, state },
      });

      if (error) throw error;

      setIsConnected(true);
      setTenantName(data.tenant);
      
      // Clean up URL
      window.history.replaceState({}, '', '/integrations');
      
      toast({
        title: "Connected to Xero",
        description: `Successfully connected to ${data.tenant}`,
      });

      await loadConnection();
    } catch (error: any) {
      toast({
        title: "Connection failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async () => {
    setIsLoading(true);
    
    try {
      console.log('Starting Xero OAuth connection...');
      const { data, error } = await supabase.functions.invoke('xero-oauth-init');

      console.log('OAuth init response:', { data, error });

      if (error) {
        console.error('OAuth init error:', error);
        throw error;
      }

      if (!data?.authUrl) {
        throw new Error('No auth URL returned from server');
      }

      console.log('Redirecting to Xero OAuth:', data.authUrl);
      // Redirect to Xero OAuth
      window.location.href = data.authUrl;
    } catch (error: any) {
      console.error('Connection error:', error);
      setIsLoading(false);
      toast({
        title: "Connection failed",
        description: error.message || 'Failed to initialize OAuth',
        variant: "destructive",
      });
    }
  };

  const handleSaveSettings = async () => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('xero_connections' as any)
        .update({
          invoice_template: settings.invoiceTemplate,
          is_enabled: settings.isEnabled,
        })
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: "Settings saved",
        description: "Your Xero integration settings have been updated.",
      });
    } catch (error: any) {
      toast({
        title: "Save failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleEnableIntegration = async (enabled: boolean) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('xero_connections' as any)
        .update({ is_enabled: enabled })
        .eq('user_id', user.id);

      if (error) throw error;

      setSettings({ ...settings, isEnabled: enabled });
      
      toast({
        title: enabled ? "Integration enabled" : "Integration disabled",
        description: enabled 
          ? "Xero integration is now active" 
          : "Xero integration has been paused",
      });
    } catch (error: any) {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDisconnect = async () => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('xero_connections' as any)
        .delete()
        .eq('user_id', user.id);

      if (error) throw error;

      setIsConnected(false);
      setTenantName('');
      setSettings({ invoiceTemplate: 'standard', isEnabled: true });
      
      toast({
        title: "Disconnected from Xero",
        description: "Your Xero integration has been removed.",
      });
    } catch (error: any) {
      toast({
        title: "Disconnect failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 512 512"
            className="h-6 w-6 mr-2 text-[#13B5EA]"
            fill="currentColor"
          >
            <path d="M339.8 177.7c-17.3-17.3-44.5-17.3-61.7 0s-17.3 44.5 0 61.7c17.3 17.3 44.5 17.3 61.7 0s17.3-44.5 0-61.7zm-8.6 53c-12.7 12.7-32.9 12.7-45.6 0-12.7-12.6-12.7-32.9 0-45.6 12.6-12.7 32.9-12.7 45.6 0 12.7 12.7 12.7 33 0 45.6zm-247-145l90.5-90.3A61.7 61.7 0 0 1 218 -23h109.5a32.5 32.5 0 0 1 23 9.5l75.7 75.8a32.2 32.2 0 0 1 9.5 23V194a61.7 61.7 0 0 1-18.4 43.4l-90.4 90.3A61.7 61.7 0 0 1 283.5 346H174a32.5 32.5 0 0 1-23-9.5l-75.8-75.7a32.2 32.2 0 0 1-9.5-23V109.4c0-16.3 6.5-32 18.2-43.5zm308.2 51c17.3-17.3 17.3-44.5 0-61.7s-44.5-17.3-61.7 0-17.3 44.5 0 61.7c17.3 17.3 44.5 17.3 61.7 0zM255 0c-8.8 0-16 7.2-16 16s7.2 16 16 16h.3a16 16 0 1 0-.3-32z" />
          </svg>
          Xero Integration
        </CardTitle>
        <CardDescription>
          Connect your Xero account to automatically sync invoices and customer data
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!isConnected ? (
          <>
            <Alert>
              <AlertDescription className="space-y-2">
                <p className="font-medium">Ready to connect Xero?</p>
                <p className="text-sm">Click the button below to securely connect your Xero account using OAuth 2.0.</p>
              </AlertDescription>
            </Alert>

            <Button 
              onClick={handleConnect} 
              disabled={isLoading}
              className="w-full"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                'Connect to Xero'
              )}
            </Button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div>
                  <p className="font-medium text-green-900 dark:text-green-100">Connected to Xero</p>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    {tenantName || 'Your Xero account is connected'}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invoiceTemplate">Invoice Template</Label>
                <Select
                  value={settings.invoiceTemplate}
                  onValueChange={(value) => setSettings({ ...settings, invoiceTemplate: value })}
                >
                  <SelectTrigger id="invoiceTemplate">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard Invoice</SelectItem>
                    <SelectItem value="detailed">Detailed Invoice</SelectItem>
                    <SelectItem value="summary">Summary Invoice</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Enable Integration</Label>
                  <p className="text-sm text-muted-foreground">
                    Allow Contract Compass to send invoices to Xero
                  </p>
                </div>
                <Switch
                  checked={settings.isEnabled}
                  onCheckedChange={handleEnableIntegration}
                />
              </div>

              <Button onClick={handleSaveSettings} className="w-full">
                Save Settings
              </Button>
            </div>

            <div className="pt-4 border-t">
              <Button 
                variant="destructive" 
                onClick={handleDisconnect}
                className="w-full"
              >
                Disconnect Xero
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default XeroIntegration;

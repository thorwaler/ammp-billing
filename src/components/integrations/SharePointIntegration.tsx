import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Building2, Check, X, FolderOpen, RefreshCw, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import SharePointFolderBrowser from "./SharePointFolderBrowser";

interface SharePointConnection {
  id: string;
  account_name: string | null;
  is_enabled: boolean;
  created_at: string;
  last_sync_at: string | null;
}

interface FolderSetting {
  id: string;
  document_type: string;
  site_id: string;
  site_name: string | null;
  drive_id: string;
  drive_name: string | null;
  folder_id: string | null;
  folder_path: string | null;
}

const DOCUMENT_TYPES = [
  { id: 'support_document', label: 'Support Documents', description: 'Invoice calculation breakdowns' },
];

const SharePointIntegration = () => {
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [connection, setConnection] = useState<SharePointConnection | null>(null);
  const [folderSettings, setFolderSettings] = useState<FolderSetting[]>([]);
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState<string | null>(null);

  useEffect(() => {
    fetchConnection();
    
    // Check for OAuth callback
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    
    if (code && window.location.search.includes('sharepoint')) {
      handleOAuthCallback(code, state);
    }
  }, []);

  const fetchConnection = async () => {
    try {
      const { data: connData, error: connError } = await supabase
        .from('sharepoint_connections')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (connError) throw connError;
      setConnection(connData);

      if (connData) {
        const { data: settingsData, error: settingsError } = await supabase
          .from('sharepoint_folder_settings')
          .select('*')
          .eq('connection_id', connData.id);

        if (settingsError) throw settingsError;
        setFolderSettings(settingsData || []);
      }
    } catch (error) {
      console.error('Error fetching SharePoint connection:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const redirectUri = `${window.location.origin}/integrations?sharepoint_callback=true`;
      
      const { data, error } = await supabase.functions.invoke('sharepoint-oauth-init', {
        body: { redirectUri },
      });

      if (error) throw error;

      // Store state for verification
      sessionStorage.setItem('sharepoint_oauth_state', data.state);
      
      // Redirect to Microsoft login
      window.location.href = data.authUrl;
    } catch (error) {
      console.error('Error initiating SharePoint OAuth:', error);
      toast.error('Failed to connect to SharePoint');
      setConnecting(false);
    }
  };

  const handleOAuthCallback = async (code: string, state: string | null) => {
    setConnecting(true);
    try {
      const storedState = sessionStorage.getItem('sharepoint_oauth_state');
      if (state && storedState && state !== storedState) {
        throw new Error('Invalid OAuth state');
      }
      sessionStorage.removeItem('sharepoint_oauth_state');

      const redirectUri = `${window.location.origin}/integrations?sharepoint_callback=true`;

      const { data, error } = await supabase.functions.invoke('sharepoint-oauth-callback', {
        body: { code, redirectUri },
      });

      if (error) throw error;

      toast.success(`Connected to SharePoint as ${data.accountName}`);
      
      // Clean up URL
      window.history.replaceState({}, document.title, '/integrations');
      
      fetchConnection();
    } catch (error) {
      console.error('Error completing SharePoint OAuth:', error);
      toast.error('Failed to complete SharePoint connection');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!connection) return;

    try {
      // Delete folder settings first (cascade should handle this, but being explicit)
      await supabase
        .from('sharepoint_folder_settings')
        .delete()
        .eq('connection_id', connection.id);

      // Delete connection
      const { error } = await supabase
        .from('sharepoint_connections')
        .delete()
        .eq('id', connection.id);

      if (error) throw error;

      setConnection(null);
      setFolderSettings([]);
      toast.success('Disconnected from SharePoint');
    } catch (error) {
      console.error('Error disconnecting SharePoint:', error);
      toast.error('Failed to disconnect from SharePoint');
    }
  };

  const handleToggleEnabled = async () => {
    if (!connection) return;

    try {
      const { error } = await supabase
        .from('sharepoint_connections')
        .update({ is_enabled: !connection.is_enabled })
        .eq('id', connection.id);

      if (error) throw error;

      setConnection({ ...connection, is_enabled: !connection.is_enabled });
      toast.success(connection.is_enabled ? 'SharePoint integration disabled' : 'SharePoint integration enabled');
    } catch (error) {
      console.error('Error toggling SharePoint:', error);
      toast.error('Failed to update SharePoint settings');
    }
  };

  const handleFolderSelect = async (
    siteId: string,
    siteName: string,
    driveId: string,
    driveName: string,
    folderId: string | null,
    folderPath: string
  ) => {
    if (!connection || !selectedDocType) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Upsert folder setting
      const existingSetting = folderSettings.find(s => s.document_type === selectedDocType);

      if (existingSetting) {
        const { error } = await supabase
          .from('sharepoint_folder_settings')
          .update({
            site_id: siteId,
            site_name: siteName,
            drive_id: driveId,
            drive_name: driveName,
            folder_id: folderId,
            folder_path: folderPath,
          })
          .eq('id', existingSetting.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('sharepoint_folder_settings')
          .insert({
            connection_id: connection.id,
            user_id: user.id,
            document_type: selectedDocType,
            site_id: siteId,
            site_name: siteName,
            drive_id: driveId,
            drive_name: driveName,
            folder_id: folderId,
            folder_path: folderPath,
          });

        if (error) throw error;
      }

      toast.success('Folder settings saved');
      setShowFolderBrowser(false);
      setSelectedDocType(null);
      fetchConnection();
    } catch (error) {
      console.error('Error saving folder settings:', error);
      toast.error('Failed to save folder settings');
    }
  };

  const getFolderSettingForType = (docType: string) => {
    return folderSettings.find(s => s.document_type === docType);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-600" />
            <CardTitle className="text-lg">SharePoint</CardTitle>
          </div>
          <CardDescription>
            Upload support documents to SharePoint
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {connection ? (
            <>
              <div className="flex items-center gap-2 text-sm">
                <Check className="h-4 w-4 text-green-500" />
                <span>Connected as {connection.account_name || 'SharePoint Account'}</span>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="sharepoint-enabled">Enable auto-upload</Label>
                <Switch
                  id="sharepoint-enabled"
                  checked={connection.is_enabled}
                  onCheckedChange={handleToggleEnabled}
                />
              </div>

              <div className="border-t pt-4">
                <h4 className="text-sm font-medium mb-3">Document Folder Settings</h4>
                <div className="space-y-3">
                  {DOCUMENT_TYPES.map(docType => {
                    const setting = getFolderSettingForType(docType.id);
                    return (
                      <div key={docType.id} className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{docType.label}</p>
                          {setting ? (
                            <button
                              type="button"
                              className="flex items-center gap-1 group max-w-full"
                              onClick={() => {
                                setSelectedDocType(docType.id);
                                setShowFolderBrowser(true);
                              }}
                              title="Click to change folder"
                            >
                              <p className="text-xs text-muted-foreground truncate">
                                {setting.site_name} / {setting.drive_name}{setting.folder_path ? ` / ${setting.folder_path}` : ''}
                              </p>
                              <Pencil className="h-3 w-3 flex-shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                          ) : (
                            <p className="text-xs text-muted-foreground">Not configured</p>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedDocType(docType.id);
                            setShowFolderBrowser(true);
                          }}
                        >
                          <FolderOpen className="h-4 w-4 mr-1" />
                          Browse
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {connection.last_sync_at && (
                <p className="text-xs text-muted-foreground">
                  Last upload: {new Date(connection.last_sync_at).toLocaleString()}
                </p>
              )}

              <Button
                variant="destructive"
                size="sm"
                className="w-full"
                onClick={handleDisconnect}
              >
                <X className="h-4 w-4 mr-1" />
                Disconnect SharePoint
              </Button>
            </>
          ) : (
            <Button
              className="w-full"
              onClick={handleConnect}
              disabled={connecting}
            >
              {connecting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Building2 className="h-4 w-4 mr-2" />
                  Connect to SharePoint
                </>
              )}
            </Button>
          )}
        </CardContent>
      </Card>

      <SharePointFolderBrowser
        open={showFolderBrowser}
        onOpenChange={setShowFolderBrowser}
        onSelect={handleFolderSelect}
      />
    </>
  );
};

export default SharePointIntegration;
